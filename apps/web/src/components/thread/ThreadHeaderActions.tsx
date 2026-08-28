import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { CircleCheckIcon, CircleDotIcon } from "lucide-react"
import { useMemo } from "react"

import { useAppPaletteActions, type AppPaletteAction } from "@/components/app-palette-context"
import { GitActionsControl } from "@/components/thread/GitActionsControl"
import { OpenInPicker } from "@/components/thread/OpenInPicker"
import { useThreadShell } from "@/hooks/use-control-plane"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { useKeybinding } from "@/hooks/use-keybindings"
import { useNowMinuteMs } from "@/hooks/use-now-minute"
import { useProjectPullRequests } from "@/hooks/use-sidebar-queues"
import { useAutoSettleAfterDays } from "@/hooks/use-thread-settle-preference"
import { dispatchThreadSettle } from "@/lib/thread-settle-actions"
import { effectiveSettled } from "@/lib/thread-settled"

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
      <ThreadSettleHotkey projectId={projectId} threadId={threadId} disabled={disabled} />
      <OpenInPicker projectId={projectId} threadId={threadId} disabled={disabled} />
      <GitActionsControl projectId={projectId} threadId={threadId} disabled={disabled} />
    </div>
  )
}

function ThreadSettleHotkey({
  projectId,
  threadId,
  disabled,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly disabled: boolean
}) {
  const thread = useThreadShell(threadId)
  const pullRequests = useProjectPullRequests(projectId)
  const nowMs = useNowMinuteMs()
  const autoSettleAfterDays = useAutoSettleAfterDays()
  const settleHotkey = useKeybinding("thread.settle")
  const changeRequestState =
    thread === undefined ? null : (pullRequests.get(thread.id)?.state ?? null)
  const settled =
    thread === undefined
      ? false
      : effectiveSettled(thread, {
          nowMs,
          autoSettleAfterDays,
          changeRequestState,
        })

  const paletteActions = useMemo<ReadonlyArray<AppPaletteAction>>(() => {
    if (thread === undefined) {
      return []
    }
    return [
      {
        id: "thread.settle",
        label: settled ? "Unsettle Thread" : "Settle Thread",
        searchValue: "Settle Unsettle settle unsettle Thread",
        shortcut: settleHotkey,
        icon: settled ? <CircleDotIcon /> : <CircleCheckIcon />,
        execute: () => dispatchThreadSettle(thread, !settled),
      },
    ]
  }, [settleHotkey, settled, thread])
  useAppPaletteActions(paletteActions)
  useKeybindingHandler(
    "thread.settle",
    () => {
      if (thread !== undefined) {
        dispatchThreadSettle(thread, !settled)
      }
    },
    thread !== undefined && !disabled,
  )

  return null
}
