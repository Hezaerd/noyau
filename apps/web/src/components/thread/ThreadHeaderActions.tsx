import type { ProjectId, ThreadId } from "@noyau/protocol/ids"

import { GitActionsControl } from "@/components/thread/GitActionsControl"
import { OpenInPicker } from "@/components/thread/OpenInPicker"

export function ThreadHeaderActions({
  projectId,
  threadId,
  branch,
  worktreePath,
  disabled,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly disabled: boolean
}) {
  return (
    <div
      data-thread-header-actions=""
      className="@container/header-actions no-drag ms-auto flex shrink-0 items-center justify-end gap-2"
    >
      <OpenInPicker projectId={projectId} threadId={threadId} disabled={disabled} />
      <GitActionsControl
        projectId={projectId}
        threadId={threadId}
        branch={branch}
        worktreePath={worktreePath}
        disabled={disabled}
      />
    </div>
  )
}
