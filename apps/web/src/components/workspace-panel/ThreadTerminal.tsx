import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import {
  TerminalId,
  type TerminalAttachStreamEvent,
  type TerminalSessionSnapshot,
} from "@noyau/contracts/terminal"
import { Option, Schema } from "effect"
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react"

import {
  subscribeTerminalAttach,
  terminalResize,
  terminalRestart,
  terminalWrite,
} from "@/lib/control-plane"
import { encodeTerminalKey } from "@/lib/terminal-key"
import { GhosttyTerminalSurface } from "@/terminal/ghostty/surface"

import type { WorkspaceTabRenderContext } from "./define-workspace-tab"

const FALLBACK_CELL_WIDTH = 8
const FALLBACK_CELL_HEIGHT = 16

const measureFallbackSize = (element: HTMLElement) => ({
  cols: Math.max(1, Math.floor(element.clientWidth / FALLBACK_CELL_WIDTH)),
  rows: Math.max(1, Math.floor(element.clientHeight / FALLBACK_CELL_HEIGHT)),
})

const decodeTerminalId = Schema.decodeUnknownOption(TerminalId)

export const renderTerminalTab = ({
  tab,
  threadId,
  projectId,
  isVisible,
}: WorkspaceTabRenderContext<"terminal">): ReactNode => {
  const terminalId = decodeTerminalId(tab.payload.terminalId)
  if (Option.isNone(terminalId) || projectId === undefined) {
    return null
  }
  return (
    <ThreadTerminal
      projectId={projectId}
      threadId={threadId}
      terminalId={terminalId.value}
      isVisible={isVisible}
    />
  )
}

export function ThreadTerminal({
  projectId,
  threadId,
  terminalId,
  isVisible,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly terminalId: string
  readonly isVisible: boolean
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const fallbackRef = useRef<HTMLPreElement>(null)
  const surfaceRef = useRef<GhosttyTerminalSurface | null>(null)
  const isVisibleRef = useRef(isVisible)
  isVisibleRef.current = isVisible
  const [snapshot, setSnapshot] = useState<TerminalSessionSnapshot | null>(null)
  const [buffer, setBuffer] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [useFallback, setUseFallback] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (mount === null) {
      return
    }

    let cancelled = false
    let surface: GhosttyTerminalSurface | null = null
    let stop: (() => void) | undefined

    const applySnapshot = (next: TerminalSessionSnapshot) => {
      setSnapshot(next)
      setError(null)
    }

    const applyToSurface = (event: TerminalAttachStreamEvent) => {
      if (event._tag === "snapshot" || event._tag === "restarted") {
        applySnapshot(event.snapshot)
        surface?.resetAndWrite(event.snapshot.history)
        return
      }
      if (event._tag === "output") {
        surface?.write(event.data)
        return
      }
      if (event._tag === "cleared") {
        surface?.resetAndWrite("")
        return
      }
      if (event._tag === "error") {
        setError(event.message)
        return
      }
      if (event._tag === "exited") {
        setSnapshot((current) =>
          current === null
            ? current
            : { ...current, status: "exited", exitCode: event.exitCode, pid: null },
        )
      }
    }

    const applyToFallback = (event: TerminalAttachStreamEvent) => {
      if (event._tag === "snapshot" || event._tag === "restarted") {
        applySnapshot(event.snapshot)
        setBuffer(event.snapshot.history)
        return
      }
      if (event._tag === "output") {
        setBuffer((current) => `${current}${event.data}`)
        return
      }
      if (event._tag === "cleared") {
        setBuffer("")
        return
      }
      if (event._tag === "error") {
        setError(event.message)
        return
      }
      if (event._tag === "exited") {
        setSnapshot((current) =>
          current === null
            ? current
            : { ...current, status: "exited", exitCode: event.exitCode, pid: null },
        )
      }
    }

    const attach = (onEvent: (event: TerminalAttachStreamEvent) => void) => {
      stop = subscribeTerminalAttach(() => {
        const live = surfaceRef.current
        if (live !== null) {
          return { projectId, threadId, terminalId, cols: live.cols, rows: live.rows }
        }
        const fallback = fallbackRef.current
        if (fallback !== null) {
          const size = measureFallbackSize(fallback)
          return { projectId, threadId, terminalId, cols: size.cols, rows: size.rows }
        }
        return { projectId, threadId, terminalId, cols: 80, rows: 24 }
      }, onEvent)
    }

    void GhosttyTerminalSurface.create(
      mount,
      (data) => {
        void terminalWrite({ projectId, threadId, terminalId, data })
      },
      (cols, rows) => {
        void terminalResize({ projectId, threadId, terminalId, cols, rows })
      },
    )
      .then((created) => {
        if (cancelled) {
          created.dispose()
          return undefined
        }
        surface = created
        surfaceRef.current = created
        attach(applyToSurface)
        if (isVisibleRef.current) {
          created.focus()
        }
        return undefined
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return
        }
        mount.replaceChildren()
        setUseFallback(true)
        setError(cause instanceof Error ? cause.message : "Unable to load the terminal renderer")
        attach(applyToFallback)
      })

    const themeObserver = new MutationObserver(() => {
      surface?.syncThemeFromMount()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => {
      cancelled = true
      stop?.()
      themeObserver.disconnect()
      surface?.dispose()
      surfaceRef.current = null
    }
  }, [projectId, terminalId, threadId])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    surfaceRef.current?.focus()
    if (useFallback) {
      fallbackRef.current?.focus()
    }
  }, [isVisible, useFallback])

  useEffect(() => {
    const fallback = fallbackRef.current
    if (fallback === null || !isVisible || !useFallback) {
      return
    }
    const observer = new ResizeObserver(() => {
      const size = measureFallbackSize(fallback)
      void terminalResize({ projectId, threadId, terminalId, cols: size.cols, rows: size.rows })
    })
    observer.observe(fallback)
    return () => {
      observer.disconnect()
    }
  }, [isVisible, projectId, terminalId, threadId, useFallback])

  useEffect(() => {
    const fallback = fallbackRef.current
    if (fallback !== null && isVisible && useFallback) {
      fallback.scrollTop = fallback.scrollHeight
    }
  }, [buffer, isVisible, useFallback])

  const onFallbackKeyDown = (event: ReactKeyboardEvent<HTMLPreElement>) => {
    const data = encodeTerminalKey(event.nativeEvent)
    if (data === null) {
      return
    }
    event.preventDefault()
    void terminalWrite({ projectId, threadId, terminalId, data })
  }

  const restart = () => {
    const surface = surfaceRef.current
    const fallback = fallbackRef.current
    const size =
      surface === null
        ? fallback === null
          ? { cols: 120, rows: 30 }
          : measureFallbackSize(fallback)
        : { cols: surface.cols, rows: surface.rows }
    void terminalRestart({
      projectId,
      threadId,
      terminalId,
      cols: size.cols,
      rows: size.rows,
    }).then((result) => {
      if (!result.ok) {
        return undefined
      }
      setSnapshot(result.value)
      surfaceRef.current?.resetAndWrite(result.value.history)
      setBuffer(result.value.history)
      return undefined
    })
  }

  const exited = snapshot?.status === "exited"

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-slot="thread-terminal">
      <div className="relative min-h-0 flex-1">
        <div ref={mountRef} className="absolute inset-0 overflow-hidden" hidden={useFallback} />
        {useFallback ? (
          <pre
            ref={fallbackRef}
            tabIndex={0}
            aria-label="Terminal"
            className="absolute inset-0 overflow-auto p-2 font-mono text-xs leading-4 text-foreground outline-none"
            onKeyDown={onFallbackKeyDown}
          >
            {buffer}
            {error === null ? null : `\n${error}`}
          </pre>
        ) : null}
      </div>
      {error !== null && !useFallback ? (
        <p className="shrink-0 border-t border-border/70 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {exited ? (
        <div className="flex shrink-0 items-center justify-between border-t border-border/70 px-2 py-1 text-xs text-muted-foreground">
          <span>Process exited{snapshot.exitCode === null ? "" : ` (${snapshot.exitCode})`}</span>
          <button
            type="button"
            className="rounded-sm px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
            onClick={restart}
          >
            Restart
          </button>
        </div>
      ) : null}
    </div>
  )
}
