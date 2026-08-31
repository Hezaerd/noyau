import type { ThreadId } from "@noyau/contracts/ids"
import {
  PREVIEW_GUEST_ABORTED_ERROR_CODE,
  PREVIEW_GUEST_PARTITION,
} from "@noyau/shared/preview-url"
import { Option, Schema } from "effect"
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from "react"

import { normalizeBrowserUrl } from "@/lib/browser-url"
import { navigateWorkspaceBrowser } from "@/lib/workspace-browser-session"

export type DesktopBrowserGuestHandle = {
  readonly goBack: () => void
  readonly goForward: () => void
  readonly reload: () => void
}

export type DesktopBrowserGuestHistory = {
  readonly canGoBack: boolean
  readonly canGoForward: boolean
}

type GuestWebviewElement = HTMLWebViewElement & {
  loadURL?: (url: string) => void
  reload?: () => void
  goBack?: () => void
  goForward?: () => void
  canGoBack?: () => boolean
  canGoForward?: () => boolean
}

const decodeGuestNavigate = Schema.decodeUnknownOption(Schema.Struct({ url: Schema.String }))
const decodeGuestFail = Schema.decodeUnknownOption(
  Schema.Struct({
    errorCode: Schema.optionalKey(Schema.Finite),
    errorDescription: Schema.optionalKey(Schema.String),
    isMainFrame: Schema.optionalKey(Schema.Boolean),
  }),
)

const isAbortedLoad = (errorCode: number): boolean => errorCode === PREVIEW_GUEST_ABORTED_ERROR_CODE

export function DesktopBrowserGuest({
  url,
  threadId,
  tabId,
  guestRef,
  onHistoryChange,
}: {
  readonly url: string
  readonly threadId: ThreadId
  readonly tabId: string
  readonly guestRef: Ref<DesktopBrowserGuestHandle | null>
  readonly onHistoryChange: (history: DesktopBrowserGuestHistory) => void
}): ReactElement {
  const nodeRef = useRef<GuestWebviewElement | null>(null)
  const lastGuestUrl = useRef(url)
  const srcRef = useRef(url)
  const [guestNode, setGuestNode] = useState<GuestWebviewElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const syncHistory = useCallback(() => {
    const guest = nodeRef.current
    if (guest === null) {
      return
    }
    onHistoryChange({
      canGoBack: guest.canGoBack?.() === true,
      canGoForward: guest.canGoForward?.() === true,
    })
  }, [onHistoryChange])

  useImperativeHandle(guestRef, () => ({
    goBack: () => nodeRef.current?.goBack?.(),
    goForward: () => nodeRef.current?.goForward?.(),
    reload: () => nodeRef.current?.reload?.(),
  }))

  const setNode = useCallback((node: HTMLWebViewElement | null) => {
    nodeRef.current = node
    setGuestNode(node)
  }, [])

  useEffect(() => {
    const guest = guestNode
    if (guest === null) {
      return
    }
    const onNavigate = (event: Event) => {
      const parsed = Option.getOrUndefined(decodeGuestNavigate(event))
      const next = normalizeBrowserUrl(parsed?.url ?? "")
      if (next === null) {
        return
      }
      lastGuestUrl.current = next
      setLoadError(null)
      syncHistory()
      if (next !== url) {
        void navigateWorkspaceBrowser(threadId, tabId, next)
      }
    }
    const onFail = (event: Event) => {
      const failed = Option.getOrUndefined(decodeGuestFail(event))
      if (failed === undefined) {
        return
      }
      if (failed.isMainFrame === false || isAbortedLoad(failed.errorCode ?? 0)) {
        return
      }
      setLoadError(failed.errorDescription ?? "This page could not be loaded.")
    }
    guest.addEventListener("did-navigate", onNavigate)
    guest.addEventListener("did-navigate-in-page", onNavigate)
    guest.addEventListener("did-stop-loading", syncHistory)
    guest.addEventListener("did-fail-load", onFail)
    return () => {
      guest.removeEventListener("did-navigate", onNavigate)
      guest.removeEventListener("did-navigate-in-page", onNavigate)
      guest.removeEventListener("did-stop-loading", syncHistory)
      guest.removeEventListener("did-fail-load", onFail)
    }
  }, [guestNode, syncHistory, tabId, threadId, url])

  useEffect(() => {
    const guest = guestNode
    if (guest === null || url === lastGuestUrl.current) {
      return
    }
    lastGuestUrl.current = url
    setLoadError(null)
    guest.loadURL?.(url)
  }, [guestNode, url])

  return (
    <div className="relative min-h-0 flex-1" data-slot="workspace-browser-guest">
      <webview
        ref={setNode}
        src={srcRef.current}
        partition={PREVIEW_GUEST_PARTITION}
        className="h-full w-full"
        webpreferences="contextIsolation=yes, sandbox=yes, nativeWindowOpen=yes"
      />
      {loadError === null ? null : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 p-6 text-center"
          data-slot="workspace-browser-load-failed"
        >
          <p className="text-sm text-foreground">This page could not be loaded.</p>
          <p className="max-w-sm text-xs text-muted-foreground">{loadError}</p>
        </div>
      )}
    </div>
  )
}
