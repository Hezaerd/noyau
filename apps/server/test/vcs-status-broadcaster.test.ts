import { assert, describe, it } from "@effect/vitest"
import { GitCommandError, type VcsStatusResult } from "@noyau/protocol/git"
import { GitRuntime, type GitRuntimeService } from "@noyau/server/git/git-runtime"
import {
  VcsStatusBroadcaster,
  vcsStatusBroadcasterLayer,
} from "@noyau/server/git/vcs-status-broadcaster"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import * as TestClock from "effect/testing/TestClock"

const baseStatus = (overrides: Partial<VcsStatusResult> = {}): VcsStatusResult => ({
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

const openPr = {
  number: 12,
  title: "Live PR",
  url: "https://github.com/hezaerd/noyau/pull/12",
  baseRef: "main",
  headRef: "feat/live",
  state: "open" as const,
  mergeability: "unknown" as const,
  ciStatus: "none" as const,
  failedChecks: [],
}

const stubGitRuntime = (status: GitRuntimeService["status"]): GitRuntimeService => ({
  status,
  listRefs: () => Effect.succeed([]),
  listWorktrees: () => Effect.succeed([]),
  switchRef: (_cwd, refName) =>
    Effect.succeed({ refName, worktreePath: null, reusedWorktree: false }),
  createRef: (_cwd, refName) => Effect.succeed({ refName }),
  createWorktree: (input) =>
    Effect.succeed({ worktree: { path: input.worktreesDir, refName: input.branch } }),
  removeWorktree: (input) => Effect.succeed({ path: input.path }),
  renameBranch: (input) => Effect.succeed({ branch: input.newBranch }),
  diffContext: () => Effect.succeed(""),
  runStackedAction: (input) =>
    Effect.succeed({
      action: input.action,
      branch: null,
      commit: { status: "skipped_not_requested" },
      push: { status: "skipped_not_requested" },
      pullRequest: { status: "skipped_not_requested" },
    }),
  githubAccount: () => Effect.succeed({ login: null }),
  publishRepository: (input) =>
    Effect.succeed({
      nameWithOwner: input.repository,
      url: `https://github.com/${input.repository}`,
      remoteName: "origin",
      branch: null,
      status: "remote_added",
    }),
})

const run = <A, E>(
  status: GitRuntimeService["status"],
  effect: Effect.Effect<A, E, VcsStatusBroadcaster>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(
        vcsStatusBroadcasterLayer.pipe(
          Layer.provide(Layer.succeed(GitRuntime)(stubGitRuntime(status))),
        ),
      )
      return yield* effect.pipe(Effect.provide(services))
    }),
  )

describe("VcsStatusBroadcaster", () => {
  it.effect("émet un snapshot local puis la PR au premier poll", () =>
    Effect.gen(function* () {
      const includePrCalls = yield* Ref.make<Array<boolean>>([])
      const events = yield* run(
        (_cwd, options) =>
          Ref.update(includePrCalls, (calls) => [...calls, options?.includePr !== false]).pipe(
            Effect.map(() =>
              options?.includePr === false ? baseStatus() : baseStatus({ pr: openPr }),
            ),
          ),
        Effect.gen(function* () {
          const broadcaster = yield* VcsStatusBroadcaster
          const fiber = yield* broadcaster
            .streamStatus("/tmp/repo", { interval: Duration.minutes(5) })
            .pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
          yield* TestClock.adjust("1 second")
          return yield* Fiber.join(fiber)
        }),
      )

      assert.strictEqual(events[0]?._tag, "snapshot")
      assert.strictEqual(events[0]?.status.pr, null)
      assert.strictEqual(events[1]?._tag, "updated")
      assert.strictEqual(events[1]?.status.pr?.number, 12)
    }),
  )

  it.effect("ne republie pas un status identique", () =>
    run(
      () => Effect.succeed(baseStatus({ pr: openPr })),
      Effect.gen(function* () {
        const broadcaster = yield* VcsStatusBroadcaster
        const first = yield* broadcaster.refresh("/tmp/repo")
        const second = yield* broadcaster.refresh("/tmp/repo")
        assert.strictEqual(first.pr?.number, 12)
        assert.strictEqual(second.pr?.number, 12)
      }),
    ),
  )

  it.effect("garde le stream vivant si gh rate", () => {
    let calls = 0
    return run(
      (_cwd, options) => {
        if (options?.includePr === false) {
          return Effect.succeed(baseStatus())
        }
        calls += 1
        if (calls === 1) {
          return Effect.fail(new GitCommandError({ operation: "gh.pr.list", detail: "boom" }))
        }
        return Effect.succeed(baseStatus({ pr: openPr }))
      },
      Effect.gen(function* () {
        const broadcaster = yield* VcsStatusBroadcaster
        const fiber = yield* broadcaster
          .streamStatus("/tmp/repo", { interval: Duration.seconds(30) })
          .pipe(Stream.take(2), Stream.runCollect, Effect.forkChild)
        // Poll cadence: PR on ticks 1,4,… — after a failed PR poll, wait for the next PR tick.
        yield* TestClock.adjust("91 seconds")
        return yield* Fiber.join(fiber)
      }),
    ).pipe(
      Effect.tap((events) =>
        Effect.sync(() => {
          assert.strictEqual(events[0]?._tag, "snapshot")
          assert.strictEqual(events[1]?.status.pr?.number, 12)
        }),
      ),
    )
  })
})
