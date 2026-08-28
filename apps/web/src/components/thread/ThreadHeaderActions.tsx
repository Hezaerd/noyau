import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { CircleCheckIcon, CircleDotIcon } from "lucide-react"
import { useMemo } from "react"

import { useAppPaletteActions, type AppPaletteAction } from "@/components/app-palette-context"
import { GitActionsControl } from "@/components/thread/GitActionsControl"
import { OpenInPicker } from "@/components/thread/OpenInPicker"
import { Button } from "@/components/ui/button"
import { useThreadShell } from "@/hooks/use-control-plane"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { useKeybinding } from "@/hooks/use-keybindings"
import { useNowMinuteMs } from "@/hooks/use-now-minute"
import { useThreadChangeRequests } from "@/hooks/use-thread-change-requests"
import {
  useAutoSettleAfterDays,
  useAutoSettleOnMergeEnabled,
} from "@/hooks/use-thread-settle-preference"
import { dispatchThreadSettle } from "@/lib/thread-settle-actions"
import { canSettle, effectiveSettled } from "@/lib/thread-settled"
import { EMPTY_THREAD_SHELLS } from "@/lib/thread-shell-index"

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
      <ThreadSettleButton projectId={projectId} threadId={threadId} disabled={disabled} />
      <OpenInPicker projectId={projectId} threadId={threadId} disabled={disabled} />
      <GitActionsControl projectId={projectId} threadId={threadId} disabled={disabled} />
    </div>
  )
}

function ThreadSettleButton({
  projectId,
  threadId,
  disabled,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly disabled: boolean
}) {
  const thread = useThreadShell(threadId)
  const settleThreads = useMemo(
    () => (thread === undefined ? EMPTY_THREAD_SHELLS : [thread]),
    [thread],
  )
  const { pullRequests } = useThreadChangeRequests(projectId, settleThreads)
  const nowMs = useNowMinuteMs()
  const autoSettleAfterDays = useAutoSettleAfterDays()
  const autoSettleOnMerge = useAutoSettleOnMergeEnabled()
  const settleHotkey = useKeybinding("thread.settle")
  const changeRequestState =
    thread === undefined ? null : (pullRequests.get(thread.id)?.state ?? null)
  const settled =
    thread === undefined
      ? false
      : effectiveSettled(thread, {
          nowMs,
          autoSettleAfterDays,
          autoSettleOnMerge,
          changeRequestState,
        })

  const paletteActions = useMemo<ReadonlyArray<AppPaletteAction>>(() => {
    if (thread === undefined) {
      return []
    }
    return [
      {
        id: "thread.settle",
        label: settled ? "Déclasser le Thread" : "Classer le Thread",
        searchValue: "Classer Déclasser settle unsettle Thread",
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

  if (thread === undefined || threadId === undefined) {
    return null
  }
  const settleBlocked = !settled && !canSettle(thread)
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled || settleBlocked}
      aria-keyshortcuts={settleHotkey}
      aria-label={settled ? "Déclasser le Thread" : "Classer le Thread"}
      onClick={() => dispatchThreadSettle(thread, !settled)}
    >
      {settled ? <CircleDotIcon /> : <CircleCheckIcon />}
      {settled ? "Déclasser" : "Classer"}
    </Button>
  )
}
