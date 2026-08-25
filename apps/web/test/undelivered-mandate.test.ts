import { ProviderSessionId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { describe, expect, it } from "vite-plus/test"

import { retryableFailedTurnMandate } from "../src/lib/undelivered-mandate"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const user = {
  _tag: "transcript.user" as const,
  threadId,
  turnId,
  text: "Les timers sont buggé",
}

describe("retryableFailedTurnMandate", () => {
  it("expose le dernier prompt si la Session est en erreur sans resumeCursor", () => {
    expect(
      retryableFailedTurnMandate({
        resumeCursor: null,
        sessionStatus: "error",
        transcript: [user],
      }),
    ).toEqual(user)
  })

  it("saute un jeton de reprise pour retrouver le mandat", () => {
    expect(
      retryableFailedTurnMandate({
        resumeCursor: null,
        sessionStatus: "error",
        transcript: [
          user,
          {
            _tag: "transcript.user",
            threadId,
            turnId: TurnId.make("30000000-0000-4000-8000-000000000002"),
            text: "Reprends",
          },
        ],
      }),
    ).toEqual(user)
  })

  it("reste muet dès qu'une session Cursor existe", () => {
    expect(
      retryableFailedTurnMandate({
        resumeCursor: { schemaVersion: 1, sessionId: ProviderSessionId.make("cursor-session-1") },
        sessionStatus: "error",
        transcript: [user],
      }),
    ).toBeUndefined()
  })
})
