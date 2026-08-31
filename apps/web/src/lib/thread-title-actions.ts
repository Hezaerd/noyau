import type { ThreadId } from "@noyau/contracts/ids"

import { buildAndDispatchCommand } from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import { makeThreadTitleRegenerateRequest } from "@/lib/thread-commands"

export const dispatchThreadTitleRegenerate = (threadId: ThreadId): void => {
  void buildAndDispatchCommand(makeThreadTitleRegenerateRequest({ threadId })).then((result) => {
    if (!result.ok) {
      showFailureToast(
        presentFailure(result.failure, {
          operation: "thread.title.regenerate",
          scope: "project",
          initiatedByUser: true,
          hasUsableData: true,
        }),
      )
    }
    return undefined
  })
}
