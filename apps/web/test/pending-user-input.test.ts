import { TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import type { LatestTurn, TurnState } from "@noyau/contracts/entities/turn"
import { ApprovalRequestId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { actionableUserInputForLatestTurn } from "../src/lib/pending-user-input"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const oldTurnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const latestTurnId = TurnId.make("40000000-0000-4000-8000-000000000002")

const request = (turnId: TurnId, requestId: string, status: "pending" | "resolved" = "pending") =>
  Schema.decodeSync(TranscriptUserInput)({
    _tag: "transcript.user-input",
    threadId,
    turnId,
    requestId: ApprovalRequestId.make(requestId),
    prompt: "Choose a direction",
    status,
  })

const latestTurn = (turnId: TurnId, state: TurnState): Pick<LatestTurn, "turnId" | "state"> => ({
  turnId,
  state,
})

describe("actionableUserInputForLatestTurn", () => {
  it("keeps the latest pending request visible across runtime settlement states", () => {
    const pending = request(latestTurnId, "request-latest")

    expect(
      (["running", "completed", "interrupted", "error"] as const).map(
        (state) =>
          actionableUserInputForLatestTurn({
            transcript: [pending],
            latestTurn: latestTurn(latestTurnId, state),
          })?.requestId,
      ),
    ).toEqual([pending.requestId, pending.requestId, pending.requestId, pending.requestId])
  })

  it("keeps the same request actionable when a reconnect changes pending to detached", () => {
    const pending = request(latestTurnId, "request-race")
    const detached = { ...pending, status: "detached" as const }
    const latest = latestTurn(latestTurnId, "completed")

    expect(
      actionableUserInputForLatestTurn({ transcript: [pending], latestTurn: latest })?.status,
    ).toBe("pending")
    expect(
      actionableUserInputForLatestTurn({ transcript: [detached], latestTurn: latest })?.status,
    ).toBe("detached")
  })

  it("does not surface an unresolved historical request after a newer Turn exists", () => {
    const stale = request(oldTurnId, "request-stale")

    expect(
      actionableUserInputForLatestTurn({
        transcript: [stale],
        latestTurn: latestTurn(latestTurnId, "completed"),
      }),
    ).toBeUndefined()
  })

  it("selects the newest pending request in the latest Turn", () => {
    const first = request(latestTurnId, "request-first")
    const newest = request(latestTurnId, "request-newest")

    expect(
      actionableUserInputForLatestTurn({
        transcript: [first, newest],
        latestTurn: latestTurn(latestTurnId, "completed"),
      })?.requestId,
    ).toBe(newest.requestId)
  })

  it("hides a request as soon as its transcript status resolves", () => {
    expect(
      actionableUserInputForLatestTurn({
        transcript: [request(latestTurnId, "request-resolved", "resolved")],
        latestTurn: latestTurn(latestTurnId, "completed"),
      }),
    ).toBeUndefined()
  })
})
