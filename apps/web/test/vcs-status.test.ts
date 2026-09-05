import type {
  VcsStatusPullRequest,
  VcsStatusResult,
  VcsStatusStreamEvent,
} from "@noyau/contracts/git"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vitest"

import {
  applyVcsStatusStreamEvent,
  createVcsStatusSubscriptionController,
  displayedThreadPr,
  nextThreadChangeRequestSnapshot,
  resolveThreadPr,
  resolveGitActionsScope,
  uniqueVcsScopes,
  uniqueVcsStatusSubscriptionScopes,
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

  it("conserve les streams retenus et réconcilie les changements de portée", () => {
    const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
    const nextProjectId = ProjectId.make("10000000-0000-4000-8000-000000000002")
    const threadA = {
      id: ThreadId.make("20000000-0000-4000-8000-000000000001"),
      worktreePath: "/tmp/a",
    }
    const threadB = {
      id: ThreadId.make("20000000-0000-4000-8000-000000000002"),
      worktreePath: "/tmp/b",
    }
    const starts: string[] = []
    const stops: string[] = []
    const events: string[] = []
    const callbacks = new Map<string, Array<(event: VcsStatusStreamEvent) => void>>()
    const subscribe = (
      scope: Parameters<typeof vcsStatusScopeKey>[0],
      onEvent: (event: VcsStatusStreamEvent) => void,
    ) => {
      const key = vcsStatusScopeKey(scope)
      starts.push(key)
      callbacks.set(key, [...(callbacks.get(key) ?? []), onEvent])
      return () => stops.push(key)
    }
    const controller = createVcsStatusSubscriptionController(subscribe, (scope) =>
      events.push(vcsStatusScopeKey(scope)),
    )

    controller.reconcile(uniqueVcsStatusSubscriptionScopes(projectId, [threadA]))
    expect(starts).toEqual([String(projectId), `${projectId}:${threadA.id}`])

    // New arrays and metadata changes retain both active streams.
    controller.reconcile(
      uniqueVcsStatusSubscriptionScopes(projectId, [{ ...threadA, worktreePath: "/tmp/a" }]),
    )
    expect(starts).toHaveLength(2)
    controller.reconcile(uniqueVcsStatusSubscriptionScopes(projectId, [threadB, threadA]))
    expect(starts).toEqual([
      String(projectId),
      `${projectId}:${threadA.id}`,
      `${projectId}:${threadB.id}`,
    ])

    controller.reconcile(uniqueVcsStatusSubscriptionScopes(projectId, [threadA]))
    expect(stops).toEqual([`${projectId}:${threadB.id}`])

    // A reassigned worktree has the same scope key but must start against its new cwd.
    controller.reconcile(
      uniqueVcsStatusSubscriptionScopes(projectId, [{ ...threadA, worktreePath: "/tmp/a-new" }]),
    )
    expect(stops).toEqual([`${projectId}:${threadB.id}`, `${projectId}:${threadA.id}`])
    expect(starts).toEqual([
      String(projectId),
      `${projectId}:${threadA.id}`,
      `${projectId}:${threadB.id}`,
      `${projectId}:${threadA.id}`,
    ])

    controller.reconcile(uniqueVcsStatusSubscriptionScopes(nextProjectId, [threadA]))
    expect(stops).toEqual([
      `${projectId}:${threadB.id}`,
      `${projectId}:${threadA.id}`,
      String(projectId),
      `${projectId}:${threadA.id}`,
    ])
    expect(starts.slice(-2)).toEqual([String(nextProjectId), `${nextProjectId}:${threadA.id}`])

    controller.dispose()
    expect(stops.slice(-2)).toEqual([String(nextProjectId), `${nextProjectId}:${threadA.id}`])

    // A callback from a retired stream is ignored after replacement and teardown.
    const retired = callbacks.get(`${projectId}:${threadA.id}`)?.[0]
    const eventCount = events.length
    retired?.({ _tag: "updated", status: status({ refName: "stale" }) })
    expect(events).toHaveLength(eventCount)
  })

  it("invalidates before a replacement can synchronously emit its snapshot", () => {
    const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
    const order: string[] = []
    const subscribe = (
      scope: Parameters<typeof vcsStatusScopeKey>[0],
      onEvent: (event: VcsStatusStreamEvent) => void,
    ) => {
      const key = vcsStatusScopeKey(scope)
      onEvent({ _tag: "snapshot", status: status() })
      order.push(`subscribed:${key}`)
      return () => undefined
    }
    const controller = createVcsStatusSubscriptionController(
      subscribe,
      (scope) => order.push(`event:${vcsStatusScopeKey(scope)}`),
      (key) => order.push(`invalidated:${key}`),
    )

    controller.reconcile(
      uniqueVcsStatusSubscriptionScopes(projectId, [{ id: threadId, worktreePath: "/tmp/old" }]),
    )
    order.length = 0
    controller.reconcile(
      uniqueVcsStatusSubscriptionScopes(projectId, [{ id: threadId, worktreePath: "/tmp/new" }]),
    )

    expect(order).toEqual([
      `invalidated:${projectId}:${threadId}`,
      `event:${projectId}:${threadId}`,
      `subscribed:${projectId}:${threadId}`,
    ])
  })
})
