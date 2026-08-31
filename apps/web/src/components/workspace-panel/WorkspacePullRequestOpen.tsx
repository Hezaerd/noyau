import type { ThreadId } from "@noyau/contracts/ids"
import type { ReactElement } from "react"

import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { openWorkspacePullRequest } from "@/lib/workspace-pr"

/** Enregistre le raccourci ; le lanceur et la palette ouvrent l’onglet. */
export function WorkspacePullRequestOpen({
  threadId,
  disabled,
}: {
  readonly threadId: ThreadId | undefined
  readonly disabled: boolean
}): ReactElement | null {
  if (threadId === undefined) {
    return null
  }
  return <WorkspacePullRequestHotkey disabled={disabled} threadId={threadId} />
}

function WorkspacePullRequestHotkey({
  threadId,
  disabled,
}: {
  readonly threadId: ThreadId
  readonly disabled: boolean
}): null {
  useKeybindingHandler(
    "thread.workspace-pr.open",
    () => {
      openWorkspacePullRequest(threadId)
    },
    !disabled,
  )
  return null
}
