import type { ProjectId, ThreadId } from "@noyau/protocol/ids"

import { GitActionsControl } from "@/components/thread/GitActionsControl"
import { OpenInPicker } from "@/components/thread/OpenInPicker"

export function ThreadHeaderActions({
  projectId,
  threadId,
  disabled,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly disabled: boolean
}) {
  return (
    <div
      data-thread-header-actions=""
      className="@container/header-actions no-drag ms-auto flex shrink-0 items-center justify-end gap-2"
    >
      <OpenInPicker projectId={projectId} threadId={threadId} disabled={disabled} />
      <GitActionsControl projectId={projectId} threadId={threadId} disabled={disabled} />
    </div>
  )
}
