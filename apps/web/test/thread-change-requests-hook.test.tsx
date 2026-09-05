// @vitest-environment happy-dom

import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import { cleanup, renderHook } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useThreadChangeRequests } from "../src/hooks/use-thread-change-requests"
import type { VcsStatusSubscribe } from "../src/lib/vcs-status"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const nextProjectId = ProjectId.make("10000000-0000-4000-8000-000000000002")
const threadAId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadBId = ThreadId.make("20000000-0000-4000-8000-000000000002")

const makeThread = (id: ThreadId, worktreePath: string | null): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id,
    projectId,
    title: "Thread",
    provider: "cursor",
    modelSelection: null,
    runtimeMode: "auto",
    branch: null,
    worktreePath,
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt: "2026-09-05T00:00:00.000Z",
    listedAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-05T00:00:00.000Z",
  })

afterEach(cleanup)

describe("useThreadChangeRequests subscriptions", () => {
  it("resubscribes after StrictMode cleanup and retains the replayed streams", () => {
    const stop = vi.fn()
    const subscribe: VcsStatusSubscribe = vi.fn(() => stop)
    const thread = makeThread(threadAId, "/tmp/a")
    const { rerender, unmount } = renderHook(
      ({ threads }) => useThreadChangeRequests(projectId, threads, subscribe),
      {
        initialProps: { threads: [thread] },
        reactStrictMode: true,
      },
    )

    expect(subscribe).toHaveBeenCalledTimes(4)
    expect(stop).toHaveBeenCalledTimes(2)
    rerender({ threads: [{ ...thread, title: "Renamed" }] })
    expect(subscribe).toHaveBeenCalledTimes(4)
    unmount()
    expect(stop).toHaveBeenCalledTimes(4)
  })

  it("keeps an immediate replacement snapshot after worktree reassignment", () => {
    let branch = "old-branch"
    const subscribe: VcsStatusSubscribe = (_scope, onEvent) => {
      onEvent({
        _tag: "snapshot",
        status: {
          isRepo: true,
          cwd: "/tmp/repo",
          refName: branch,
          isDefaultRef: false,
          hasPrimaryRemote: false,
          hasWorkingTreeChanges: false,
          hasUpstream: false,
          aheadCount: 0,
          behindCount: 0,
          worktreePath: null,
          pr: null,
        },
      })
      return () => undefined
    }
    const { result, rerender } = renderHook(
      ({ threads }) => useThreadChangeRequests(projectId, threads, subscribe),
      { initialProps: { threads: [makeThread(threadAId, "/tmp/a")] } },
    )
    expect(result.current.liveBranches.get(threadAId)).toBe("old-branch")

    branch = "new-branch"
    rerender({ threads: [makeThread(threadAId, "/tmp/b")] })
    expect(result.current.liveBranches.get(threadAId)).toBe("new-branch")
  })

  it("retains metadata and reorder updates while reconciling membership, paths, projects, and unmount", () => {
    const starts: string[] = []
    const stops: string[] = []
    const subscribe: VcsStatusSubscribe = vi.fn((scope) => {
      const key =
        scope.threadId === undefined ? scope.projectId : `${scope.projectId}:${scope.threadId}`
      starts.push(key)
      return () => stops.push(key)
    })
    const threadA = makeThread(threadAId, "/tmp/a")
    const threadB = makeThread(threadBId, "/tmp/b")
    const { rerender, unmount } = renderHook(
      ({
        currentProjectId,
        threads,
      }: {
        currentProjectId: ProjectId
        threads: ReadonlyArray<ThreadShell>
      }) => useThreadChangeRequests(currentProjectId, threads, subscribe),
      { initialProps: { currentProjectId: projectId, threads: [threadA] } },
    )

    expect(starts).toEqual([String(projectId), `${projectId}:${threadAId}`])

    rerender({ currentProjectId: projectId, threads: [makeThread(threadAId, "/tmp/a")] })
    expect(starts).toHaveLength(2)

    rerender({ currentProjectId: projectId, threads: [threadB, threadA] })
    expect(starts).toEqual([
      String(projectId),
      `${projectId}:${threadAId}`,
      `${projectId}:${threadBId}`,
    ])
    rerender({ currentProjectId: projectId, threads: [threadA, threadB] })
    expect(starts).toHaveLength(3)
    rerender({ currentProjectId: projectId, threads: [threadA] })
    expect(stops).toEqual([`${projectId}:${threadBId}`])

    rerender({
      currentProjectId: projectId,
      threads: [makeThread(threadAId, "/tmp/a-reassigned")],
    })
    expect(starts).toHaveLength(4)
    expect(stops).toEqual([`${projectId}:${threadBId}`, `${projectId}:${threadAId}`])

    rerender({ currentProjectId: nextProjectId, threads: [threadA] })
    expect(starts.slice(-2)).toEqual([String(nextProjectId), `${nextProjectId}:${threadAId}`])
    expect(stops.slice(-2)).toEqual([String(projectId), `${projectId}:${threadAId}`])

    unmount()
    expect(stops.slice(-2)).toEqual([String(nextProjectId), `${nextProjectId}:${threadAId}`])
  })
})
