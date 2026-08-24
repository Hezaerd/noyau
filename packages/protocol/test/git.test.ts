import { describe, expect, it } from "@effect/vitest"
import {
  GitPublishRepositoryInput,
  GitStackedAction,
  PrepareWorktree,
  VcsRemoveWorktreeInput,
  VcsScope,
  VcsStatusResult,
  VcsStatusStreamEvent,
} from "@noyau/protocol/git"
import { Schema } from "effect"

describe("git contracts", () => {
  it("décode une portée VCS projet ou thread", () => {
    expect(
      Schema.decodeSync(VcsScope)({
        projectId: "10000000-0000-4000-8000-000000000001",
      }).threadId,
    ).toBeUndefined()
    expect(
      Schema.decodeSync(VcsScope)({
        projectId: "10000000-0000-4000-8000-000000000001",
        threadId: "20000000-0000-4000-8000-000000000001",
      }).threadId,
    ).toBe("20000000-0000-4000-8000-000000000001")
  })

  it("round-trip un status et les actions empilées", () => {
    const status = Schema.decodeSync(VcsStatusResult)({
      isRepo: true,
      cwd: "/tmp/repo",
      refName: "main",
      isDefaultRef: true,
      hasPrimaryRemote: true,
      hasWorkingTreeChanges: false,
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
      worktreePath: null,
      pr: {
        number: 42,
        title: "Checkout live",
        url: "https://github.com/hezaerd/noyau/pull/42",
        baseRef: "main",
        headRef: "feat/checkout",
        state: "open",
        mergeability: "mergeable",
      },
    })
    expect(status.refName).toBe("main")
    expect(status.pr?.number).toBe(42)
    expect(Schema.decodeSync(GitStackedAction)("commit_push_pr")).toBe("commit_push_pr")
    expect(
      Schema.decodeSync(VcsStatusStreamEvent)({
        _tag: "snapshot",
        status,
      })._tag,
    ).toBe("snapshot")
  })

  it("décode un Publish GitHub", () => {
    expect(
      Schema.decodeSync(GitPublishRepositoryInput)({
        projectId: "10000000-0000-4000-8000-000000000001",
        repository: "hezaerd/noyau",
        visibility: "private",
      }).visibility,
    ).toBe("private")
  })

  it("décode removeWorktree avec force optionnel", () => {
    expect(
      Schema.decodeSync(VcsRemoveWorktreeInput)({
        projectId: "10000000-0000-4000-8000-000000000001",
        path: "/tmp/worktrees/repo/feat",
        force: true,
      }).force,
    ).toBe(true)
  })

  it("décode prepareWorktree pour le premier Turn", () => {
    expect(
      Schema.decodeSync(PrepareWorktree)({
        baseBranch: "main",
        startFromOrigin: true,
      }),
    ).toEqual({
      baseBranch: "main",
      startFromOrigin: true,
    })
  })
})
