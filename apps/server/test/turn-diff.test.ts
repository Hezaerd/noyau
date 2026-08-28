import { describe, expect, it } from "@effect/vitest"
import { checkpointRefForTurn, Turn } from "@noyau/contracts/entities/turn"
import { ThreadId, TurnId } from "@noyau/contracts/ids"
import {
  parseTurnDiffNumstat,
  resolveTurnDiffCheckpoints,
  shouldCaptureBaselineOnTurnStarted,
  turnDiffStatusFromSettlement,
} from "@noyau/server/git/turn-diff"
import { Schema } from "effect"

describe("parseTurnDiffNumstat", () => {
  it("lit les stats et ignore les lignes vides", () => {
    expect(
      parseTurnDiffNumstat(
        "12\t3\tsrc/app.ts\n-\t-\tassets/logo.png\n\n1\t0\told.ts => src/new.ts\n",
      ),
    ).toEqual([
      { path: "src/app.ts", kind: "modified", additions: 12, deletions: 3 },
      { path: "assets/logo.png", kind: "modified", additions: 0, deletions: 0 },
      { path: "src/new.ts", kind: "modified", additions: 1, deletions: 0 },
    ])
  })

  it("joint name-status et expand les renames à accolades", () => {
    expect(
      parseTurnDiffNumstat(
        [
          "A\tsrc/new.ts",
          "M\tsrc/app.ts",
          "D\told.ts",
          "1\t0\tsrc/new.ts",
          "12\t3\tsrc/app.ts",
          "0\t4\told.ts",
          "2\t1\tsrc/{a => b}/file.ts",
        ].join("\n"),
      ),
    ).toEqual([
      { path: "src/new.ts", kind: "added", additions: 1, deletions: 0 },
      { path: "src/app.ts", kind: "modified", additions: 12, deletions: 3 },
      { path: "old.ts", kind: "deleted", additions: 0, deletions: 4 },
      { path: "src/b/file.ts", kind: "modified", additions: 2, deletions: 1 },
    ])
  })
})

describe("turnDiffStatusFromSettlement", () => {
  it("mappe le settle du Turn", () => {
    expect(turnDiffStatusFromSettlement("completed")).toBe("ready")
    expect(turnDiffStatusFromSettlement("interrupted")).toBe("missing")
    expect(turnDiffStatusFromSettlement("error")).toBe("error")
  })
})

describe("shouldCaptureBaselineOnTurnStarted", () => {
  it("attend le bind worktree et capture sinon", () => {
    expect(shouldCaptureBaselineOnTurnStarted({ prepareWorktree: true, worktreePath: null })).toBe(
      false,
    )
    expect(
      shouldCaptureBaselineOnTurnStarted({
        prepareWorktree: true,
        worktreePath: "/tmp/wt",
      }),
    ).toBe(true)
    expect(shouldCaptureBaselineOnTurnStarted({ prepareWorktree: false, worktreePath: null })).toBe(
      true,
    )
  })
})

describe("resolveTurnDiffCheckpoints", () => {
  const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
  const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")
  const decodeTurn = Schema.decodeSync(Turn)
  const turnFields = {
    id: turnId,
    threadId,
    ordinal: 1,
    state: "completed" as const,
    requestedAt: "2026-08-19T12:00:00.000Z",
    startedAt: "2026-08-19T12:00:00.100Z",
    completedAt: "2026-08-19T12:00:02.000Z",
  }
  const turn = (turnDiff?: Turn["turnDiff"]): Turn =>
    decodeTurn(turnDiff === undefined ? turnFields : { ...turnFields, turnDiff })

  it("pointe le baseline ordinal-1 et le Checkpoint du Turn", () => {
    const checkpointRef = checkpointRefForTurn(threadId, 1)
    expect(
      resolveTurnDiffCheckpoints({
        threadId,
        turnId,
        turns: [
          turn({
            checkpointRef,
            status: "ready",
            files: [{ path: "src.ts", kind: "modified", additions: 1, deletions: 0 }],
          }),
        ],
      }),
    ).toEqual({
      _tag: "ok",
      from: checkpointRefForTurn(threadId, 0),
      to: checkpointRef,
    })
  })

  it("signale un Turn absent ou sans capture", () => {
    expect(resolveTurnDiffCheckpoints({ threadId, turnId, turns: [] })).toEqual({
      _tag: "unavailable",
      reason: "turn-not-found",
    })
    expect(resolveTurnDiffCheckpoints({ threadId, turnId, turns: [turn()] })).toEqual({
      _tag: "unavailable",
      reason: "not-captured",
    })
  })
})
