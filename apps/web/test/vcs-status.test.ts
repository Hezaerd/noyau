import type { VcsStatusPullRequest, VcsStatusResult } from "@noyau/contracts/git"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vitest"

import {
  applyVcsStatusStreamEvent,
  displayedThreadPr,
  nextThreadChangeRequestSnapshot,
  resolveThreadPr,
  resolveGitActionsScope,
  uniqueVcsScopes,
  vcsScopeForThread,
  vcsStatusScopeKey,
} from "../src/lib/vcs-status"

const pr = (overrides: Partial<VcsStatusPullRequest> = {}): VcsStatusPullRequest => ({
  number: 12,
  title: "Live PR",
  url: "https://github.com/hezaerd/noyau/pull/12",
  baseRef: "main",
  headRef: "feat/live",
  state: "open",
  mergeability: "unknown",
  ciStatus: "none",
  failedChecks: [],
  ...overrides,
})

const status = (overrides: Partial<VcsStatusResult> = {}): VcsStatusResult => ({
  isRepo: true,
  cwd: "/tmp/repo",
  refName: "feat/live",
  isDefaultRef: false,
  hasPrimaryRemote: true,
  hasWorkingTreeChanges: false,
  hasUpstream: true,
  aheadCount: 0,
  behindCount: 0,
  worktreePath: null,
  pr: null,
  ...overrides,
})

describe("vcs-status", () => {
  it("remplace le status à chaque event", () => {
    expect(
      applyVcsStatusStreamEvent(null, { _tag: "snapshot", status: status({ pr: pr() }) }).pr
        ?.number,
    ).toBe(12)
    expect(
      applyVcsStatusStreamEvent(status({ pr: pr() }), {
        _tag: "updated",
        status: status({ pr: pr({ state: "merged" }) }),
      }).pr?.state,
    ).toBe("merged")
  })

  it("n’affiche la PR live que si la branche du Thread matche HEAD", () => {
    expect(
      resolveThreadPr({
        threadBranch: "feat/live",
        gitStatus: status({ pr: pr() }),
      })?.number,
    ).toBe(12)
    expect(
      resolveThreadPr({
        threadBranch: "feat/other",
        gitStatus: status({ pr: pr() }),
      }),
    ).toBeNull()
  })

  it("retient une PR terminale pour un checkout local qui a changé de branche", () => {
    const snapshot = { branch: "feat/live", pr: pr({ state: "merged" }) }
    expect(
      nextThreadChangeRequestSnapshot({
        threadBranch: "main",
        gitStatus: status({ refName: "main", pr: null }),
        snapshot,
        retainTerminalOnBranchMismatch: true,
      }),
    ).toBeUndefined()
    expect(
      displayedThreadPr({
        thread: { branch: "feat/live", worktreePath: null },
        gitStatus: status({ refName: "main", pr: null }),
        snapshot,
      })?.state,
    ).toBe("merged")
    expect(
      displayedThreadPr({
        thread: { branch: "feat/live", worktreePath: "/tmp/wt" },
        gitStatus: status({ refName: "main", pr: null }),
        snapshot,
      }),
    ).toBeNull()
  })

  it("ne retient jamais une PR ouverte après un mismatch", () => {
    expect(
      displayedThreadPr({
        thread: { branch: "feat/live", worktreePath: null },
        gitStatus: status({ refName: "main", pr: null }),
        snapshot: { branch: "feat/live", pr: pr({ state: "open" }) },
      }),
    ).toBeNull()
  })

  it("regroupe les scopes sidebar : un local + un par worktree", () => {
    const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
    const local = { id: ThreadId.make("20000000-0000-4000-8000-000000000001"), worktreePath: null }
    const worktree = {
      id: ThreadId.make("20000000-0000-4000-8000-000000000002"),
      worktreePath: "/tmp/wt",
    }
    expect(uniqueVcsScopes(projectId, [local, worktree])).toEqual([
      { projectId },
      { projectId, threadId: worktree.id },
    ])
    expect(vcsScopeForThread(projectId, local)).toEqual({ projectId })
    expect(vcsStatusScopeKey({ projectId, threadId: worktree.id })).toBe(
      `${projectId}:${worktree.id}`,
    )
  })

  it("n’ouvre pas le WorkspaceRoot tant que le Thread sélectionné n’est pas résolu", () => {
    const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
    expect(resolveGitActionsScope(projectId, { threadId, thread: undefined })).toBeNull()
    expect(
      resolveGitActionsScope(projectId, {
        threadId,
        thread: { id: threadId, worktreePath: "/tmp/wt" },
      }),
    ).toEqual({ projectId, threadId })
    expect(resolveGitActionsScope(projectId, { threadId: undefined, thread: undefined })).toEqual({
      projectId,
    })
  })
})
