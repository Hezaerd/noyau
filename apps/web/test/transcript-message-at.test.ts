import { TranscriptItem } from "@noyau/contracts/entities/transcript"
import { LatestTurn } from "@noyau/contracts/entities/turn"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { DateTime, Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  formatTranscriptMessageAt,
  transcriptItemCopyText,
  transcriptItemMessageAt,
} from "../src/lib/transcript-message-at"

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const decodeTranscript = Schema.decodeSync(TranscriptItem)
const decodeTurn = Schema.decodeSync(LatestTurn)

const userItem = decodeTranscript({
  _tag: "transcript.user",
  threadId,
  turnId,
  text: "Parfait c'est lock-in",
})

const assistantItem = decodeTranscript({
  _tag: "transcript.assistant",
  threadId,
  turnId,
  text: "C'est noté.",
})

const turnClock = (input: {
  readonly requestedAt?: string
  readonly completedAt?: string | null
}) =>
  decodeTurn({
    turnId,
    state: input.completedAt === undefined || input.completedAt === null ? "running" : "completed",
    requestedAt: input.requestedAt ?? "2026-08-25T16:54:00.000Z",
    startedAt: input.requestedAt ?? "2026-08-25T16:54:00.000Z",
    completedAt: input.completedAt === undefined ? null : input.completedAt,
  })

const localAt = (year: number, monthIndex: number, day: number, hour: number, minute: number) =>
  DateTime.makeUnsafe(new Date(year, monthIndex, day, hour, minute, 0).toISOString())

const timeOf = (at: DateTime.Utc) =>
  DateTime.formatLocal(at, { locale: "fr", hour: "numeric", minute: "2-digit" })

describe("transcript message at", () => {
  it("shows only the time for a message from today", () => {
    const at = localAt(2026, 7, 25, 12, 54)
    const nowMs = new Date(2026, 7, 25, 18, 0, 0).getTime()
    expect(formatTranscriptMessageAt(at, nowMs)).toBe(
      DateTime.formatLocal(at, {
        locale: "fr",
        hour: "numeric",
        minute: "2-digit",
      }),
    )
  })

  it("prefixes yesterday and keeps the date for older days", () => {
    const yesterday = localAt(2026, 7, 24, 12, 54)
    const older = localAt(2026, 6, 13, 9, 5)
    const lastYear = localAt(2025, 11, 31, 9, 5)
    const nowMs = new Date(2026, 7, 25, 18, 0, 0).getTime()

    expect(formatTranscriptMessageAt(yesterday, nowMs)).toBe(`hier à ${timeOf(yesterday)}`)
    expect(formatTranscriptMessageAt(older, nowMs)).toBe(
      `${new Intl.DateTimeFormat("fr", { day: "numeric", month: "numeric" }).format(new Date(DateTime.toEpochMillis(older)))} ${timeOf(older)}`,
    )
    expect(formatTranscriptMessageAt(lastYear, nowMs)).toBe(
      `${new Intl.DateTimeFormat("fr", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(DateTime.toEpochMillis(lastYear)))} ${timeOf(lastYear)}`,
    )
  })

  it("uses requestedAt for the user and completedAt for a settled assistant", () => {
    const turn = turnClock({
      requestedAt: "2026-08-25T16:54:00.000Z",
      completedAt: "2026-08-25T16:55:12.000Z",
    })
    expect(transcriptItemMessageAt(userItem, turn)).toEqual(turn.requestedAt)
    expect(transcriptItemMessageAt(assistantItem, turn)).toEqual(turn.completedAt)
    expect(transcriptItemMessageAt(assistantItem, turn, true)).toBeUndefined()
    expect(
      transcriptItemMessageAt(
        assistantItem,
        turnClock({ requestedAt: "2026-08-25T16:54:00.000Z", completedAt: null }),
      ),
    ).toBeUndefined()
  })

  it("copies user and settled assistant text, never a streaming assistant", () => {
    expect(transcriptItemCopyText(userItem)).toBe("Parfait c'est lock-in")
    expect(transcriptItemCopyText(assistantItem)).toBe("C'est noté.")
    expect(transcriptItemCopyText(assistantItem, true)).toBeUndefined()
    expect(
      transcriptItemCopyText(
        decodeTranscript({
          _tag: "transcript.user",
          threadId,
          turnId,
          attachments: [
            {
              type: "image",
              id: "40000000-0000-4000-8000-000000000001-0",
              name: "shot.png",
              mimeType: "image/png",
              sizeBytes: 12,
            },
          ],
        }),
      ),
    ).toBeUndefined()
  })
})
