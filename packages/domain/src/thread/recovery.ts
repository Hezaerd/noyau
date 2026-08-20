import { ThreadSessionSet, type ThreadEvent } from "@noyau/protocol/thread/events"
import type { DateTime } from "effect"

import type { ThreadState } from "./projector.ts"

export const BOOT_RECOVERY_LAST_ERROR = "Provider process lost during server restart"

/**
 * Passe pure de boot. Elle ne tente ni probe ni `session/load` : les Sessions
 * qui ne peuvent plus avoir de process vivant deviennent `error`.
 */
export const recoverAfterBoot = (
  state: ThreadState,
  updatedAt: DateTime.Utc,
  lastError: string = BOOT_RECOVERY_LAST_ERROR,
): ReadonlyArray<ThreadEvent> =>
  state.threads.flatMap((thread) => {
    const session = thread.session
    return session?.status === "starting" || session?.status === "running"
      ? [
          ThreadSessionSet.make({
            threadId: thread.threadId,
            session: {
              ...session,
              status: "error",
              lastError,
              updatedAt,
            },
          }),
        ]
      : []
  })
