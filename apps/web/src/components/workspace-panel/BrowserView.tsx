import { ArrowLeftIcon, ArrowRightIcon, GlobeIcon, RotateCwIcon } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
  type Ref,
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { WorkspaceTabRenderContext } from "@/components/workspace-panel/define-workspace-tab"
import {
  DesktopBrowserGuest,
  type DesktopBrowserGuestHandle,
  type DesktopBrowserGuestHistory,
} from "@/components/workspace-panel/DesktopBrowserGuest"
import { browserTabUrl, normalizeBrowserUrl } from "@/lib/browser-url"
import { isDesktopRuntime } from "@/lib/desktop-bridge"
import {
  ensureWorkspaceBrowserSession,
  navigateWorkspaceBrowser,
} from "@/lib/workspace-browser-session"

export type BrowserTabPayload = {
  readonly url: string | null
}

export function BrowserView({
  threadId,
  tab,
  isVisible,
}: WorkspaceTabRenderContext<"browser", BrowserTabPayload>): ReactElement {
  const submittedUrl = browserTabUrl(tab.payload)
  const [draft, setDraft] = useState(submittedUrl ?? "")
  const [invalid, setInvalid] = useState(false)
  const [pending, setPending] = useState(false)
  const [history, setHistory] = useState<DesktopBrowserGuestHistory>({
    canGoBack: false,
    canGoForward: false,
  })
  const chromeRef = useRef<HTMLFormElement>(null)
  const guestRef = useRef<DesktopBrowserGuestHandle | null>(null)
  const desktop = isDesktopRuntime()
  const guestReady = desktop && submittedUrl !== null

  useEffect(() => {
    void ensureWorkspaceBrowserSession(threadId, tab.id)
  }, [tab.id, threadId])

  useEffect(() => {
    setDraft(submittedUrl ?? "")
    setInvalid(false)
  }, [submittedUrl, tab.id])

  useEffect(() => {
    if (!isVisible || submittedUrl !== null) {
      return
    }
    chromeRef.current?.querySelector<HTMLInputElement>("[data-slot=input]")?.focus()
  }, [isVisible, submittedUrl, tab.id])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = normalizeBrowserUrl(draft)
    if (next === null) {
      setInvalid(draft.trim().length > 0)
      return
    }
    setInvalid(false)
    setPending(true)
    void (async () => {
      const result = await navigateWorkspaceBrowser(threadId, tab.id, next)
      setPending(false)
      if (!result.ok && result.failure._tag === "InvalidInput") {
        setInvalid(true)
      }
    })()
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-slot="workspace-browser">
      <form
        ref={chromeRef}
        className="flex shrink-0 items-center gap-1 border-b border-border/70 px-1.5 py-1"
        aria-busy={pending || undefined}
        data-slot="workspace-browser-chrome"
        onSubmit={submit}
      >
        <Button
          aria-label="Go back"
          className="text-muted-foreground"
          disabled={!guestReady || !history.canGoBack}
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => guestRef.current?.goBack()}
        >
          <ArrowLeftIcon />
        </Button>
        <Button
          aria-label="Go forward"
          className="text-muted-foreground"
          disabled={!guestReady || !history.canGoForward}
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => guestRef.current?.goForward()}
        >
          <ArrowRightIcon />
        </Button>
        <Button
          aria-label="Reload"
          className="text-muted-foreground"
          disabled={!guestReady}
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => guestRef.current?.reload()}
        >
          <RotateCwIcon />
        </Button>
        <Input
          aria-invalid={invalid || undefined}
          aria-label="Address"
          className="min-w-0 flex-1"
          name="url"
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            if (invalid) {
              setInvalid(false)
            }
          }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "Escape") {
              return
            }
            event.preventDefault()
            setDraft(submittedUrl ?? "")
            setInvalid(false)
          }}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={pending}
          inputMode="url"
          placeholder="Enter a URL"
          size="sm"
          spellCheck={false}
          type="text"
          value={draft}
        />
      </form>
      <BrowserGuest
        guestRef={guestRef}
        onHistoryChange={setHistory}
        tabId={tab.id}
        threadId={threadId}
        url={submittedUrl}
      />
    </div>
  )
}

function BrowserGuest({
  url,
  threadId,
  tabId,
  guestRef,
  onHistoryChange,
}: {
  readonly url: string | null
  readonly threadId: WorkspaceTabRenderContext["threadId"]
  readonly tabId: string
  readonly guestRef: Ref<DesktopBrowserGuestHandle | null>
  readonly onHistoryChange: (history: DesktopBrowserGuestHistory) => void
}): ReactElement {
  if (url === null) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
        data-slot="workspace-browser-empty"
      >
        <GlobeIcon aria-hidden="true" className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Enter a URL to open a page.</p>
      </div>
    )
  }

  if (!isDesktopRuntime()) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
        data-slot="workspace-browser-desktop-required"
      >
        <p className="text-sm text-foreground">The in-app browser runs in the desktop app.</p>
        <p className="max-w-sm truncate text-xs text-muted-foreground">{url}</p>
      </div>
    )
  }

  return (
    <DesktopBrowserGuest
      guestRef={guestRef}
      onHistoryChange={onHistoryChange}
      tabId={tabId}
      threadId={threadId}
      url={url}
    />
  )
}
