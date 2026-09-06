import type { ThreadId } from "@noyau/contracts/ids"
import { PlusIcon, XIcon } from "lucide-react"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import {
  workspaceTabCatalog,
  workspaceTabKeepMountedKinds,
} from "@/components/workspace-panel/catalog"
import type { WorkspaceTabRegistration } from "@/components/workspace-panel/define-workspace-tab"
import { useAppAtomValue } from "@/hooks/use-app-atom"
import { cn } from "@/lib/utils"
import { releaseRemovedWorkspaceBrowserSessions } from "@/lib/workspace-browser-session"
import {
  EMPTY_TAB_ID_SET,
  reconcileKeepMountedTabIds,
  resolveActiveWorkspaceTab,
} from "@/lib/workspace-panel"
import {
  clampWorkspacePanelWidth,
  maxWorkspacePanelWidth,
  minWorkspacePanelWidth,
} from "@/lib/workspace-panel-persist"
import {
  activateWorkspaceTab,
  closeAllWorkspaceTabs,
  closeOtherWorkspaceTabs,
  closeWorkspaceTab,
  closeWorkspaceTabsToRight,
  getWorkspacePanel,
  openWorkspaceTab,
  setWorkspacePanelWidth,
  workspacePanelAtom,
  workspacePanelWidthAtom,
} from "@/state/workspace-panel"

const openKind = (threadId: ThreadId, kind: WorkspaceTabRegistration): void => {
  if (kind.available !== undefined && !kind.available()) {
    return
  }
  openWorkspaceTab(threadId, kind)
}

const closeAndRelease = (threadId: ThreadId, close: () => void): void => {
  const previous = getWorkspacePanel(threadId).tabs
  close()
  void releaseRemovedWorkspaceBrowserSessions(threadId, previous, getWorkspacePanel(threadId).tabs)
}

export function WorkspacePanel({
  threadId,
  kinds = workspaceTabCatalog,
}: {
  readonly threadId: ThreadId
  readonly kinds?: ReadonlyArray<WorkspaceTabRegistration>
}): ReactElement | null {
  const state = useAppAtomValue(workspacePanelAtom(threadId))
  const width = useAppAtomValue(workspacePanelWidthAtom)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const activeTab = resolveActiveWorkspaceTab(state)
  const maxWidth = maxWorkspacePanelWidth(viewportWidth)
  const minWidth = minWorkspacePanelWidth(viewportWidth)
  const panelWidth = clampWorkspacePanelWidth(width, viewportWidth)
  const keepMountedKinds = useMemo(
    () =>
      kinds === workspaceTabCatalog
        ? workspaceTabKeepMountedKinds
        : new Set(kinds.flatMap((kind) => (kind.keepMounted === true ? [kind.kind] : []))),
    [kinds],
  )
  const [committedTabIds, setCommittedTabIds] = useState<ReadonlySet<string>>(EMPTY_TAB_ID_SET)
  const renderedTabIds = reconcileKeepMountedTabIds({
    previous: committedTabIds,
    tabs: state.tabs,
    activeTabId: activeTab?.id ?? null,
    keepMountedKinds,
  })

  useLayoutEffect(() => {
    setCommittedTabIds((current) => {
      const next = reconcileKeepMountedTabIds({
        previous: current,
        tabs: state.tabs,
        activeTabId: activeTab?.id ?? null,
        keepMountedKinds,
      })
      if (next.size === current.size && [...next].every((tabId) => current.has(tabId))) {
        return current
      }
      return next
    })
  }, [activeTab?.id, keepMountedKinds, state.tabs])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  if (!state.open && state.tabs.length === 0) {
    return null
  }

  const availableKinds = kinds.filter(
    (kind) => kind.launchable !== false && (kind.available === undefined || kind.available()),
  )
  const kindByName = new Map(kinds.map((kind) => [kind.kind, kind]))
  return (
    <aside
      className={cn(
        "surface-panel relative flex h-full min-h-0 shrink-0 flex-col border-s border-border/70",
        !state.open && "hidden",
      )}
      data-slot="workspace-panel"
      style={{ width: panelWidth }}
    >
      <WorkspacePanelResizeHandle width={panelWidth} minWidth={minWidth} maxWidth={maxWidth} />
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-border/70 px-1.5">
        <div className="min-w-0 flex-1 overflow-x-auto pe-8">
          <div
            aria-label="Workspace panel tabs"
            className="flex min-w-max items-center gap-0.5"
            role="tablist"
          >
            {state.tabs.map((tab) => {
              const kind = kindByName.get(tab.kind)
              const label = kind?.titleOf?.(tab) ?? kind?.label ?? tab.kind
              const Icon = kind?.icon
              return (
                <WorkspacePanelTab
                  key={tab.id}
                  threadId={threadId}
                  id={workspaceTabDomId(tab.id)}
                  panelId={workspaceTabPanelDomId(tab.id)}
                  active={tab.id === activeTab?.id}
                  onNavigate={(direction, currentTab) => {
                    const tabElements = Array.from(
                      currentTab
                        .closest('[role="tablist"]')
                        ?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
                    )
                    const currentIndex = tabElements.findIndex(
                      (element) => element.id === workspaceTabDomId(tab.id),
                    )
                    if (currentIndex < 0 || tabElements.length === 0) {
                      return
                    }
                    const nextIndex =
                      direction === "previous"
                        ? (currentIndex - 1 + tabElements.length) % tabElements.length
                        : (currentIndex + 1) % tabElements.length
                    const nextTab = tabElements[nextIndex]
                    nextTab?.focus()
                    const nextTabId = nextTab?.getAttribute("data-tab-id")
                    if (nextTabId !== null && nextTabId !== undefined) {
                      activateWorkspaceTab(threadId, nextTabId)
                    }
                  }}
                  label={label}
                  icon={Icon === undefined ? null : <Icon />}
                  onActivate={() => activateWorkspaceTab(threadId, tab.id)}
                  onClose={() =>
                    closeAndRelease(threadId, () => closeWorkspaceTab(threadId, tab.id))
                  }
                  onCloseOthers={() =>
                    closeAndRelease(threadId, () => closeOtherWorkspaceTabs(threadId, tab.id))
                  }
                  onCloseToRight={() =>
                    closeAndRelease(threadId, () => closeWorkspaceTabsToRight(threadId, tab.id))
                  }
                  onCloseAll={() =>
                    closeAndRelease(threadId, () => closeAllWorkspaceTabs(threadId))
                  }
                  tabId={tab.id}
                />
              )
            })}
            {state.tabs.length > 0 && availableKinds.length > 0 ? (
              <WorkspacePanelAddMenu
                kinds={availableKinds}
                onOpen={(kind) => openKind(threadId, kind)}
              />
            ) : null}
          </div>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {activeTab === null ? (
          <WorkspacePanelLauncher
            kinds={availableKinds}
            onOpen={(kind) => openKind(threadId, kind)}
          />
        ) : null}
        {state.tabs.map((tab) => {
          const kind = kindByName.get(tab.kind)
          if (kind === undefined) {
            return null
          }
          const isActive = tab.id === activeTab?.id
          const isVisible = isActive && state.open
          const shouldRender = tab.id === activeTab?.id || renderedTabIds.has(tab.id)
          return (
            <div
              key={tab.id}
              className={cn(
                "absolute inset-0 min-h-0",
                isVisible ? "z-1" : "invisible pointer-events-none",
              )}
              data-slot="workspace-tab-surface"
              data-tab-id={tab.id}
              data-tab-kind={tab.kind}
              id={workspaceTabPanelDomId(tab.id)}
              aria-labelledby={workspaceTabDomId(tab.id)}
              aria-hidden={!isVisible}
              hidden={!isVisible}
              role="tabpanel"
            >
              {shouldRender ? kind.render({ threadId, tab, isActive, isVisible }) : null}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function WorkspacePanelAddMenu({
  kinds,
  onOpen,
}: {
  readonly kinds: ReadonlyArray<WorkspaceTabRegistration>
  readonly onOpen: (kind: WorkspaceTabRegistration) => void
}): ReactElement {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            aria-label="Add workspace tab"
            className="text-muted-foreground"
            size="icon-xs"
            variant="ghost"
          />
        }
      >
        <PlusIcon />
      </MenuTrigger>
      <MenuPopup align="start" className="surface-overlay before:hidden" side="bottom">
        {kinds.map((kind) => {
          const Icon = kind.icon
          return (
            <MenuItem key={kind.kind} onClick={() => onOpen(kind)}>
              <Icon />
              {kind.label}
            </MenuItem>
          )
        })}
      </MenuPopup>
    </Menu>
  )
}

function WorkspacePanelTab({
  threadId,
  id,
  panelId,
  tabId,
  active,
  label,
  icon,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onNavigate,
}: {
  readonly threadId: ThreadId
  readonly id: string
  readonly panelId: string
  readonly tabId: string
  readonly active: boolean
  readonly label: string
  readonly icon: ReactNode
  readonly onActivate: () => void
  readonly onClose: () => void
  readonly onCloseOthers: () => void
  readonly onCloseToRight: () => void
  readonly onCloseAll: () => void
  readonly onNavigate: (direction: "next" | "previous", currentTab: HTMLElement) => void
}): ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className={cn(
              "group flex h-7 max-w-48 items-center gap-1 rounded-md px-1.5 text-xs",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
            data-active={active ? "" : undefined}
            data-tab-id={tabId}
            data-slot="workspace-panel-tab"
          />
        }
      >
        <button
          type="button"
          role="tab"
          id={id}
          data-tab-id={tabId}
          aria-controls={panelId}
          aria-label={label}
          aria-selected={active}
          className="flex min-w-0 flex-1 items-center gap-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          tabIndex={active ? 0 : -1}
          onClick={onActivate}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault()
              onNavigate("next", event.currentTarget)
            } else if (event.key === "ArrowLeft") {
              event.preventDefault()
              onNavigate("previous", event.currentTarget)
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault()
              const tabs = Array.from(
                event.currentTarget
                  .closest('[role="tablist"]')
                  ?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [],
              )
              const target = event.key === "Home" ? tabs[0] : tabs.at(-1)
              target?.focus()
              const targetTabId = target?.getAttribute("data-tab-id")
              if (targetTabId !== null && targetTabId !== undefined) {
                activateWorkspaceTab(threadId, targetTabId)
              }
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              onActivate()
            }
          }}
        >
          <span aria-hidden="true">{icon}</span>
          <span className="truncate">{label}</span>
        </button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={`Close ${label}`}
          className="text-muted-foreground opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100 hover:bg-background/80 hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <XIcon className="size-3" />
        </Button>
      </ContextMenuTrigger>
      <ContextMenuPopup align="start" side="bottom">
        <ContextMenuItem onClick={onClose}>Close</ContextMenuItem>
        <ContextMenuItem onClick={onCloseOthers}>Close others</ContextMenuItem>
        <ContextMenuItem onClick={onCloseToRight}>Close to the right</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onCloseAll}>Close all</ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  )
}

function WorkspacePanelLauncher({
  kinds,
  onOpen,
}: {
  readonly kinds: ReadonlyArray<WorkspaceTabRegistration>
  readonly onOpen: (kind: WorkspaceTabRegistration) => void
}): ReactElement {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-3 p-6"
      data-slot="workspace-panel-launcher"
    >
      {kinds.length === 0 ? null : (
        <div className="grid w-full max-w-72 grid-cols-2 gap-2">
          {kinds.map((kind) => {
            const Icon = kind.icon
            return (
              <button
                key={kind.kind}
                type="button"
                aria-label={kind.label}
                className="flex flex-col items-start gap-2 rounded-lg border border-border/70 p-3 text-start hover:bg-accent/50"
                onClick={() => onOpen(kind)}
              >
                <span aria-hidden="true">
                  <Icon />
                </span>
                <span className="text-sm font-medium">{kind.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WorkspacePanelResizeHandle({
  width,
  minWidth,
  maxWidth,
}: {
  readonly width: number
  readonly minWidth: number
  readonly maxWidth: number
}): ReactElement {
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const pendingWidthRef = useRef<number | undefined>(undefined)
  const pendingFrameRef = useRef<number | undefined>(undefined)

  const flushPendingWidth = () => {
    const frame = pendingFrameRef.current
    if (frame !== undefined) {
      cancelAnimationFrame(frame)
      pendingFrameRef.current = undefined
    }
    const pendingWidth = pendingWidthRef.current
    pendingWidthRef.current = undefined
    if (pendingWidth !== undefined) {
      setWorkspacePanelWidth(pendingWidth)
    }
  }

  const scheduleWidth = (nextWidth: number) => {
    pendingWidthRef.current = nextWidth
    if (pendingFrameRef.current !== undefined) {
      return
    }
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = undefined
      const pendingWidth = pendingWidthRef.current
      pendingWidthRef.current = undefined
      if (pendingWidth !== undefined) {
        setWorkspacePanelWidth(pendingWidth)
      }
    })
  }

  useEffect(
    () => () => {
      const frame = pendingFrameRef.current
      if (frame !== undefined) {
        cancelAnimationFrame(frame)
      }
      pendingFrameRef.current = undefined
      pendingWidthRef.current = undefined
      dragRef.current = null
    },
    [],
  )

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== null) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 16
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault()
      setWorkspacePanelWidth(
        clampWorkspacePanelWidth(
          width + (event.key === "ArrowLeft" ? step : -step),
          window.innerWidth,
        ),
      )
    } else if (event.key === "Home") {
      event.preventDefault()
      setWorkspacePanelWidth(minWidth)
    } else if (event.key === "End") {
      event.preventDefault()
      setWorkspacePanelWidth(maxWidth)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) {
      return
    }
    const nextWidth = clampWorkspacePanelWidth(
      drag.startWidth + (drag.startX - event.clientX),
      window.innerWidth,
    )
    scheduleWidth(nextWidth)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }
    flushPendingWidth()
    dragRef.current = null
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize workspace panel"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      className="absolute inset-y-0 -start-1 z-10 w-2 cursor-col-resize outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background pointer-coarse:before:absolute pointer-coarse:before:inset-y-0 pointer-coarse:before:-start-5 pointer-coarse:before:w-11"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onKeyDown={onKeyDown}
    />
  )
}

const workspaceTabDomId = (tabId: string): string => `workspace-tab-${tabId}`
const workspaceTabPanelDomId = (tabId: string): string => `workspace-tabpanel-${tabId}`
