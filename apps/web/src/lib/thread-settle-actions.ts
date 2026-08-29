import type { ThreadShell } from "@noyau/contracts/shell"

import { buildAndDispatchCommand } from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import { makeThreadSettleRequest, makeThreadUnsettleRequest } from "@/lib/thread-commands"
import { applyOptimisticThreadSettle, canSettle } from "@/lib/thread-settled"
import { patchAppliedShellThread } from "@/state/shell"
import { setThreadPinned } from "@/state/thread-pins"

export const dispatchThreadSettle = (
  thread: Pick<
    ThreadShell,
    | "id"
    | "settledOverride"
    | "settledAt"
    | "sessionStatus"
    | "latestTurn"
    | "hasPendingApprovals"
    | "hasPendingUserInput"
  >,
  nextSettled: boolean,
  options: { readonly initiatedByUser?: boolean } = {},
): void => {
  if (nextSettled && !canSettle(thread)) {
    return
  }
  const initiatedByUser = options.initiatedByUser !== false
  const dispatched = nextSettled
    ? buildAndDispatchCommand(makeThreadSettleRequest({ threadId: thread.id }))
    : buildAndDispatchCommand(makeThreadUnsettleRequest({ threadId: thread.id }))
  void dispatched.then((result) => {
    if (!result.ok) {
      showFailureToast(
        presentFailure(result.failure, {
          operation: nextSettled ? "thread.settle" : "thread.unsettle",
          scope: "project",
          initiatedByUser,
          hasUsableData: true,
        }),
      )
      return undefined
    }
    if (nextSettled) {
      setThreadPinned(thread.id, false)
    }
    patchAppliedShellThread(thread.id, (current) =>
      applyOptimisticThreadSettle(current, nextSettled),
    )
    return undefined
  })
}
