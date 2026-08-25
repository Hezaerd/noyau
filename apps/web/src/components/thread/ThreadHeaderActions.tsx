import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { CircleCheckIcon, CircleDotIcon } from "lucide-react"
import { useEffect, useMemo } from "react"

import { useAppPaletteActions, type AppPaletteAction } from "@/components/app-palette-context"
import { GitActionsControl } from "@/components/thread/GitActionsControl"
import { OpenInPicker } from "@/components/thread/OpenInPicker"
import { Button } from "@/components/ui/button"
import { useControlPlaneSelector } from "@/hooks/use-control-plane"
import { useKeybinding } from "@/hooks/use-keybindings"
import { useNowMinuteMs } from "@/hooks/use-now-minute"
import { useThreadChangeRequests } from "@/hooks/use-thread-change-requests"
import {
  useAutoSettleAfterDays,
  useAutoSettleOnMergeEnabled,
} from "@/hooks/use-thread-settle-preference"
import { isKeybindingRecorderActive, matchesKeybinding } from "@/lib/keybindings"
import { dispatchThreadSettle } from "@/lib/thread-settle-actions"
import { canSettle, effectiveSettled } from "@/lib/thread-settled"

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
  const threads = useControlPlaneSelector((state) => state.threads)
  const thread = threads.find((candidate) => candidate.id === threadId)
  const { pullRequests } = useThreadChangeRequests(projectId, thread === undefined ? [] : [thread])
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

  useEffect(() => {
    if (thread === undefined || disabled) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isKeybindingRecorderActive() ||
        document.querySelector('[role="dialog"]') !== null
      ) {
        return
      }
      if (!matchesKeybinding(event, "thread.settle")) {
        return
      }
      event.preventDefault()
      dispatchThreadSettle(thread, !settled)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [disabled, settled, thread])

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
