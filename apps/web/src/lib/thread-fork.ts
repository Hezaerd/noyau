import type { SessionStatus } from "@noyau/contracts/entities/session"
import type { ThreadForkOrigin } from "@noyau/contracts/entities/thread"

/** A native fork cannot accept prompts until its provider has returned its new session cursor. */
export const isForkComposerLocked = (input: {
  readonly forkOrigin?: ThreadForkOrigin | undefined
  readonly sessionStatus?: SessionStatus | null | undefined
}): boolean =>
  input.forkOrigin !== undefined &&
  (input.sessionStatus === "starting" || input.sessionStatus === "error")
