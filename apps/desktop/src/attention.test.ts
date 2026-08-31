import { Effect, Option } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  normalizeBadgeCount,
  openThreadFromNotification,
  shouldShowTurnNotification,
  turnNotificationOptions,
} from "./attention"
import {
  decodeBadgeCount,
  decodeOpenThreadFromNotificationOption,
  decodeTurnNotification,
} from "./attention-contract"

const notification = {
  projectId: "10000000-0000-4000-8000-000000000001",
  threadId: "20000000-0000-4000-8000-000000000001",
  title: "Fix sidebar",
  body: "Noyau · Terminé",
}

describe("desktop attention", () => {
  it("normalizes badge counts to a non-negative integer", () => {
    expect(normalizeBadgeCount(3)).toBe(3)
    expect(normalizeBadgeCount(3.9)).toBe(3)
    expect(normalizeBadgeCount(0)).toBe(0)
    expect(normalizeBadgeCount(-2)).toBe(0)
    expect(normalizeBadgeCount(Number.NaN)).toBe(0)
  })

  it("shows a Turn notification only while the app window is unfocused", () => {
    expect(shouldShowTurnNotification(false)).toBe(true)
    expect(shouldShowTurnNotification(true)).toBe(false)
  })

  it("decodes a badge count and rejects negatives", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        expect(yield* decodeBadgeCount(2)).toBe(2)
        const rejected = yield* Effect.result(decodeBadgeCount(-1))
        expect(rejected._tag).toBe("Failure")
      }),
    ))

  it("builds a silent OS notification and a click payload", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const decoded = yield* decodeTurnNotification(notification)
        expect(turnNotificationOptions(decoded)).toEqual({
          title: "Fix sidebar",
          body: "Noyau · Terminé",
          silent: true,
        })
        expect(openThreadFromNotification(decoded)).toEqual({
          projectId: notification.projectId,
          threadId: notification.threadId,
        })
      }),
    ))

  it("parses a click payload and drops malformed IPC", () => {
    expect(
      Option.getOrUndefined(
        decodeOpenThreadFromNotificationOption({
          projectId: notification.projectId,
          threadId: notification.threadId,
        }),
      ),
    ).toEqual({
      projectId: notification.projectId,
      threadId: notification.threadId,
    })
    expect(
      Option.getOrUndefined(
        decodeOpenThreadFromNotificationOption({ projectId: "not-a-uuid", threadId: "also-bad" }),
      ),
    ).toBeUndefined()
    expect(Option.getOrUndefined(decodeOpenThreadFromNotificationOption(null))).toBeUndefined()
  })
})
