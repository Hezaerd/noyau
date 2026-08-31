import type { ThreadId } from "@noyau/contracts/ids"
import type { ReactElement } from "react"

import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { openWorkspaceBrowser } from "@/lib/workspace-browser"

/** Enregistre le raccourci ; le lanceur et la palette ouvrent l’onglet. */
export function WorkspaceBrowserOpen({
  threadId,
  disabled,
}: {
  readonly threadId: ThreadId | undefined
  readonly disabled: boolean
}): ReactElement | null {
  if (threadId === undefined) {
    return null
  }
  return <WorkspaceBrowserHotkey disabled={disabled} threadId={threadId} />
}

function WorkspaceBrowserHotkey({
  threadId,
  disabled,
}: {
  readonly threadId: ThreadId
  readonly disabled: boolean
}): null {
  useKeybindingHandler(
    "thread.workspace-browser.open",
    () => {
      openWorkspaceBrowser(threadId)
    },
    !disabled,
  )
  return null
}
