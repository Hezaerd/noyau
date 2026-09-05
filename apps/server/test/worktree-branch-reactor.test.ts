import { createHash } from "node:crypto"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it, layer as effectLayer } from "@effect/vitest"
import { ClientCommandRequest } from "@noyau/contracts/commands"
import { TurnImageAttachment } from "@noyau/contracts/entities/attachment"
import { TranscriptAssistant, TranscriptUser } from "@noyau/contracts/entities/transcript"
import { type DomainEvent } from "@noyau/contracts/events"
import { ActorId, AttachmentId, ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadMetaUpdated, ThreadTurnStarted } from "@noyau/contracts/thread/events"
import { DEFAULT_THREAD_TITLE } from "@noyau/contracts/thread/title"
import { unavailableAgentSkillInstallerLayer } from "@noyau/server/agent-skill/installer"
import { ControlPlane, makeControlPlaneLayer } from "@noyau/server/control-plane"
import { noopDiscordPresenceLayer } from "@noyau/server/discord/presence"
import { GitRuntime, type GitRuntimeService } from "@noyau/server/git/git-runtime"
import { VcsStatusBroadcaster } from "@noyau/server/git/vcs-status-broadcaster"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import { staticProviderRegistryLayer } from "@noyau/server/provider/provider-instance-registry"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import {
  TextGeneration,
  type BranchNameGenerationInput,
  type TextGenerationService,
} from "@noyau/server/text-generation/text-generation"
import { threadLiveLayer } from "@noyau/server/thread-live"
import { WorkspaceRootAccess } from "@noyau/server/workspace-root"
import {
  Context,
  Crypto,
  DateTime,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Path,
  Schema,
  Stream,
} from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/* eslint-disable import/no-relative-parent-imports -- Focused reactor coverage uses the real service seams. */
import {
  makeWorktreeBranchReactor,
  type DispatchInternal,
} from "../src/text-generation/worktree-branch-reactor.ts"
/* eslint-enable import/no-relative-parent-imports */
import {
  stubGitRuntimeLayer,
  stubVcsStatusBroadcasterLayer,
  testServerConfigLayer,
} from "./fixtures.ts"

const actorId = Schema.decodeSync(ActorId)("human:rpc-test")
const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const threadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001")
const directThreadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000011")
const directZeroTurnThreadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000012")
const directMultipleTurnThreadId = Schema.decodeSync(ThreadId)(
  "20000000-0000-4000-8000-000000000013",
)
const directMetaThreadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000014")

const uuid = (index: number) => `30000000-0000-4000-8000-${index.toString().padStart(12, "0")}`
const directTurnId = Schema.decodeSync(TurnId)(uuid(101))
const directZeroTurnEventId = Schema.decodeSync(TurnId)(uuid(109))
const directMultipleTurnFirstId = Schema.decodeSync(TurnId)(uuid(102))
const directMultipleTurnSecondId = Schema.decodeSync(TurnId)(uuid(103))
const directMetaTurnId = Schema.decodeSync(TurnId)(uuid(104))
const encodeTranscriptAssistant = Schema.encodeSync(Schema.fromJsonString(TranscriptAssistant))
const encodeTranscriptUser = Schema.encodeSync(Schema.fromJsonString(TranscriptUser))

const persistedWorktreeEvent = (
  event: DomainEvent,
  eventThreadId: ThreadId,
): PersistedEvent<DomainEvent> => ({
  eventId: uuid(105),
  sequence: 105,
  projectId,
  actorId,
  correlationId: uuid(106),
  causationId: uuid(107),
  occurredAt: DateTime.makeUnsafe("2026-08-20T00:00:00.000Z"),
  schemaVersion: 1,
  aggregate: { kind: "thread", id: eventThreadId },
  aggregateVersion: 1,
  event,
})

const request = (input: (typeof ClientCommandRequest)["Encoded"]) =>
  Schema.decodeSync(ClientCommandRequest)(input)

const testCrypto = () => {
  let counter = 0
  return Crypto.make({
    randomBytes: (size) => {
      const bytes = new Uint8Array(size)
      counter += 1
      bytes[size - 1] = counter % 256
      bytes[size - 2] = (counter >> 8) % 256
      return bytes
    },
    digest: (algorithm, data) =>
      Effect.succeed(
        new Uint8Array(createHash(algorithm.toLowerCase().replace("-", "")).update(data).digest()),
      ),
  })
}

const emptyStatus = (cwd: string) => ({
  isRepo: false,
  cwd,
  refName: null,
  isDefaultRef: false,
  hasPrimaryRemote: false,
  hasWorkingTreeChanges: false,
  hasUpstream: false,
  aheadCount: 0,
  behindCount: 0,
  worktreePath: null,
  pr: null,
})

const stubGitRuntime = (overrides: Partial<GitRuntimeService> = {}): GitRuntimeService => ({
  status: (cwd) => Effect.succeed(emptyStatus(cwd)),
  listRefs: () => Effect.succeed({ isRepo: false, refs: [] }),
  listWorktrees: () => Effect.succeed([]),
  switchRef: (_cwd, refName) =>
    Effect.succeed({ refName, worktreePath: null, reusedWorktree: false }),
  createRef: (_cwd, refName) => Effect.succeed({ refName }),
  createWorktree: (input) =>
    Effect.succeed({ worktree: { path: `${input.worktreesDir}/stub`, refName: input.branch } }),
  renameBranch: (input) => Effect.succeed({ branch: input.newBranch }),
  isGitRepository: () => Effect.succeed(false),
  captureCheckpoint: () => Effect.void,
  hasCheckpointRef: () => Effect.succeed(false),
  diffCheckpoints: () => Effect.succeed(""),
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
  getPullRequest: (_cwd, number) =>
    Effect.succeed({
      number,
      title: `PR ${number}`,
      url: `https://github.com/hezaerd/noyau/pull/${number}`,
      body: "",
      author: null,
      state: "open",
      baseRef: "main",
      headRef: "feat",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      additions: 0,
      deletions: 0,
      mergeability: "unknown",
      ciStatus: "none",
      failedChecks: [],
      reviews: [],
      comments: [],
      commits: [],
      files: [],
      patch: "",
    }),
  submitPullRequestReview: () => Effect.succeed({}),
  publishRepository: (input) =>
    Effect.succeed({
      nameWithOwner: input.repository,
      url: `https://github.com/${input.repository}`,
      remoteName: "origin",
      branch: null,
      status: "remote_added",
    }),
  ...overrides,
})

const stubTextGenerationLayer = (
  generate: (input: BranchNameGenerationInput) => { readonly branch: string },
) =>
  Layer.succeed(TextGeneration)({
    generateThreadTitle: () => Effect.succeed({ title: "Generated title" }),
    generateGitDraft: () => Effect.succeed({ title: "draft: test", body: "Generated in tests." }),
    generateBranchName: (input) => Effect.succeed(generate(input)),
  })

const layer = (
  generate: (input: BranchNameGenerationInput) => { readonly branch: string },
  git: Layer.Layer<GitRuntime>,
  broadcaster: Layer.Layer<VcsStatusBroadcaster> = stubVcsStatusBroadcasterLayer(),
) =>
  makeControlPlaneLayer().pipe(
    Layer.provideMerge(unavailableAgentSkillInstallerLayer),
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(unavailableProviderLayer),
    Layer.provideMerge(staticProviderRegistryLayer),
    Layer.provideMerge(threadLiveLayer),
    Layer.provideMerge(noopDiscordPresenceLayer),
    Layer.provideMerge(git),
    Layer.provideMerge(broadcaster),
    Layer.provideMerge(stubTextGenerationLayer(generate)),
    Layer.provideMerge(
      Layer.succeed(WorkspaceRootAccess)({
        isAvailable: () => Effect.succeed(true),
      }),
    ),
    Layer.provideMerge(NodeFileSystem.layer),
    Layer.provideMerge(Path.layer),
    Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto())),
  )

const run = <A, E>(
  generate: (input: BranchNameGenerationInput) => { readonly branch: string },
  git: Layer.Layer<GitRuntime>,
  effect: Effect.Effect<A, E, ControlPlane>,
  broadcaster?: Layer.Layer<VcsStatusBroadcaster>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(layer(generate, git, broadcaster))
      return yield* effect.pipe(Effect.provide(services))
    }),
  )

const seedProjectAndThread = Effect.fn("seedProjectAndThread")(function* (
  controlPlane: ControlPlane["Service"],
  checkout?: { readonly branch: string; readonly worktreePath: string },
) {
  yield* controlPlane.dispatch(
    request({
      _tag: "project.create",
      commandId: uuid(1),
      payload: { projectId, name: "Noyau", workspaceRoot: "/tmp" },
    }),
    actorId,
  )
  yield* controlPlane.dispatch(
    request({
      _tag: "thread.create",
      commandId: uuid(2),
      payload: Object.assign(
        { threadId, projectId, title: DEFAULT_THREAD_TITLE },
        checkout === undefined
          ? {}
          : { branch: checkout.branch, worktreePath: checkout.worktreePath },
      ),
    }),
    actorId,
  )
})

const readThreadBranch = Effect.fn("readThreadBranch")(function* (
  controlPlane: ControlPlane["Service"],
) {
  const frames = yield* controlPlane
    .subscribeThread({ threadId })
    .pipe(Stream.take(1), Stream.runCollect)
  const snapshot = frames[0]
  assert.strictEqual(snapshot?.kind, "snapshot")
  return snapshot?.kind === "snapshot" ? snapshot.snapshot.thread.branch : null
})

describe("Worktree branch reactor", () => {
  it.effect("renames a temporary worktree branch from the first-turn prompt", () => {
    const renames: Array<{ readonly oldBranch: string; readonly newBranch: string }> = []
    const refreshed: Array<string> = []
    return run(
      (input) => {
        assert.strictEqual(input.message, "Add a safer reconnect backoff.")
        return { branch: "Safer reconnect backoff" }
      },
      Layer.succeed(GitRuntime)(
        stubGitRuntime({
          renameBranch: (input) => {
            renames.push({ oldBranch: input.oldBranch, newBranch: input.newBranch })
            return Effect.succeed({ branch: input.newBranch })
          },
        }),
      ),
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* seedProjectAndThread(controlPlane, {
          branch: "noyau/f4ae4e0e",
          worktreePath: "/tmp/worktrees/noyau/f4ae4e0e",
        })
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(3),
            payload: { threadId, text: "Add a safer reconnect backoff." },
          }),
          actorId,
        )
        yield* controlPlane.drainReactors

        assert.deepStrictEqual(renames, [
          { oldBranch: "noyau/f4ae4e0e", newBranch: "noyau/safer-reconnect-backoff" },
        ])
        assert.deepStrictEqual(refreshed, ["/tmp/worktrees/noyau/f4ae4e0e"])
        assert.strictEqual(yield* readThreadBranch(controlPlane), "noyau/safer-reconnect-backoff")
      }),
      stubVcsStatusBroadcasterLayer((cwd) => {
        refreshed.push(cwd)
      }),
    )
  })

  it.effect("leaves a non-temporary checkout unchanged", () => {
    const refreshed: Array<string> = []
    return run(
      () => ({ branch: "should-not-apply" }),
      stubGitRuntimeLayer,
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* seedProjectAndThread(controlPlane, {
          branch: "feature/manual",
          worktreePath: "/tmp/worktrees/noyau/manual",
        })
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(3),
            payload: { threadId, text: "Add a safer reconnect backoff." },
          }),
          actorId,
        )
        yield* controlPlane.drainReactors
        assert.deepStrictEqual(refreshed, [])
        assert.strictEqual(yield* readThreadBranch(controlPlane), "feature/manual")
      }),
      stubVcsStatusBroadcasterLayer((cwd) => {
        refreshed.push(cwd)
      }),
    )
  })

  it.effect("renames the temporary branch created on first-turn prepareWorktree", () => {
    const renames: Array<{ readonly oldBranch: string; readonly newBranch: string }> = []
    return run(
      (input) => {
        assert.strictEqual(input.message, "Add a safer reconnect backoff.")
        return { branch: "safer-reconnect-backoff" }
      },
      Layer.succeed(GitRuntime)(
        stubGitRuntime({
          renameBranch: (input) => {
            renames.push({ oldBranch: input.oldBranch, newBranch: input.newBranch })
            return Effect.succeed({ branch: input.newBranch })
          },
        }),
      ),
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        yield* seedProjectAndThread(controlPlane)
        yield* controlPlane.dispatch(
          request({
            _tag: "thread.turn.start",
            commandId: uuid(3),
            payload: {
              threadId,
              text: "Add a safer reconnect backoff.",
              prepareWorktree: { baseBranch: "main" },
            },
          }),
          actorId,
        )
        yield* controlPlane.drainReactors

        assert.strictEqual(renames.length, 1)
        assert.match(renames[0]?.oldBranch ?? "", /^noyau\/[0-9a-f]{8}$/)
        assert.strictEqual(renames[0]?.newBranch, "noyau/safer-reconnect-backoff")
        assert.strictEqual(yield* readThreadBranch(controlPlane), "noyau/safer-reconnect-backoff")
      }),
    )
  })

  it.effect("does not record a VCS refresh until the Effect runs", () => {
    const refreshed: Array<string> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(
          stubVcsStatusBroadcasterLayer((cwd) => {
            refreshed.push(cwd)
          }),
        )
        const broadcaster = Context.get(services, VcsStatusBroadcaster)
        const pending = broadcaster.refresh("/tmp/worktrees/noyau/f4ae4e0e")
        assert.deepStrictEqual(refreshed, [])
        yield* pending
        assert.deepStrictEqual(refreshed, ["/tmp/worktrees/noyau/f4ae4e0e"])
      }),
    )
  })
})

effectLayer(memoryLayer)("Worktree branch reactor SQL", (spec) => {
  spec.effect("bounds eligibility and preserves first-user and branch guards", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql`
        INSERT INTO projection_projects (
          project_id, name, workspace_root, available, created_at, updated_at
        ) VALUES (
          ${projectId}, 'Noyau', '/tmp', 1,
          '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        )
      `
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, provider, runtime_mode, status, branch, worktree_path,
          created_at, updated_at
        ) VALUES
          (
            ${directThreadId}, ${projectId}, ${DEFAULT_THREAD_TITLE}, 'cursor', 'full-access', 'active',
            'noyau/f4ae4e0e', '/tmp/worktrees/noyau/f4ae4e0e',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${directZeroTurnThreadId}, ${projectId}, ${DEFAULT_THREAD_TITLE}, 'cursor', 'full-access', 'active',
            'noyau/zero-turn', '/tmp/worktrees/noyau/zero-turn',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${directMultipleTurnThreadId}, ${projectId}, ${DEFAULT_THREAD_TITLE}, 'cursor', 'full-access', 'active',
            'noyau/multiple-turns', '/tmp/worktrees/noyau/multiple-turns',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${directMetaThreadId}, ${projectId}, ${DEFAULT_THREAD_TITLE}, 'cursor', 'full-access', 'active',
            'noyau/ab12cd34', '/tmp/worktrees/noyau/meta-bind',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
      `
      yield* sql`
        INSERT INTO projection_turns (
          turn_id, thread_id, ordinal, state, requested_at, started_at
        ) VALUES
          (
            ${directTurnId}, ${directThreadId}, 1, 'running',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${directMultipleTurnFirstId}, ${directMultipleTurnThreadId}, 1, 'completed',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${directMultipleTurnSecondId}, ${directMultipleTurnThreadId}, 2, 'completed',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          ),
          (
            ${directMetaTurnId}, ${directMetaThreadId}, 1, 'completed',
            '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
          )
      `

      const attachment = TurnImageAttachment.make({
        type: "image",
        id: AttachmentId.make(`${uuid(108)}-0`),
        name: "first.png",
        mimeType: "image/png",
        sizeBytes: 1,
      })
      const assistantItem = encodeTranscriptAssistant(
        TranscriptAssistant.make({
          threadId: directMetaThreadId,
          turnId: directMetaTurnId,
          text: "Earlier response",
        }),
      )
      const firstUserItem = encodeTranscriptUser(
        TranscriptUser.make({
          threadId: directMetaThreadId,
          turnId: directMetaTurnId,
          text: "   ",
          attachments: [attachment],
        }),
      )
      const laterUserItem = encodeTranscriptUser(
        TranscriptUser.make({
          threadId: directMetaThreadId,
          turnId: directMetaTurnId,
          text: "Later prompt should not be selected",
        }),
      )
      yield* sql`
        INSERT INTO projection_transcript (
          transcript_id, thread_id, turn_id, ordinal, kind, item, event_sequence
        ) VALUES
          (
            'direct-meta-assistant', ${directMetaThreadId}, ${directMetaTurnId}, 1,
            'transcript.assistant', ${assistantItem}, 1
          ),
          (
            'direct-meta-first-user', ${directMetaThreadId}, ${directMetaTurnId}, 2,
            'transcript.user', ${firstUserItem}, 2
          ),
          (
            'direct-meta-later-user', ${directMetaThreadId}, ${directMetaTurnId}, 3,
            'transcript.user', ${laterUserItem}, 3
          )
      `

      const generationStarted = yield* Deferred.make<void>()
      const releaseGeneration = yield* Deferred.make<void>()
      const generationInputs: Array<BranchNameGenerationInput> = []
      let generationCalls = 0
      const textGeneration: TextGenerationService = {
        generateThreadTitle: () => Effect.succeed({ title: "unused" }),
        generateGitDraft: () => Effect.succeed({ title: "unused", body: "unused" }),
        generateBranchName: (input) =>
          Effect.gen(function* () {
            generationCalls += 1
            generationInputs.push(input)
            if (input.message === "Start prompt") {
              yield* Deferred.succeed(generationStarted, undefined)
              yield* Deferred.await(releaseGeneration)
              return { branch: "Start prompt" }
            }
            assert.strictEqual(input.message, "[image: first.png]")
            return { branch: "Attachment prompt" }
          }),
      }
      const renames: Array<{ readonly oldBranch: string; readonly newBranch: string }> = []
      const git = stubGitRuntime({
        renameBranch: (input) => {
          renames.push({ oldBranch: input.oldBranch, newBranch: input.newBranch })
          return Effect.succeed({ branch: input.newBranch })
        },
      })
      const dispatched: Array<unknown> = []
      const dispatchInternal: DispatchInternal = (command) =>
        Effect.sync(() => {
          dispatched.push(command)
        })
      const queries: Array<string> = []
      const trackedSql = new Proxy(sql, {
        apply(target, _thisArg, args) {
          const [strings, ...values] = args
          queries.push(Array.from(strings).join("?"))
          return target(strings, ...values)
        },
      })
      const reactor = yield* makeWorktreeBranchReactor(dispatchInternal).pipe(
        Effect.provideService(SqlClient, trackedSql),
        Effect.provideService(Crypto.Crypto, testCrypto()),
        Effect.provideService(TextGeneration, textGeneration),
        Effect.provideService(GitRuntime, git),
        Effect.provideService(
          VcsStatusBroadcaster,
          Context.get(yield* Layer.build(stubVcsStatusBroadcasterLayer()), VcsStatusBroadcaster),
        ),
      )

      const fiber = yield* Effect.forkChild(
        reactor(
          persistedWorktreeEvent(
            ThreadTurnStarted.make({
              threadId: directThreadId,
              turnId: directTurnId,
              text: "Start prompt",
            }),
            directThreadId,
          ),
        ),
      )
      yield* Deferred.await(generationStarted)
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))
      yield* sql`
        UPDATE projection_threads SET branch = 'feature/manual' WHERE thread_id = ${directThreadId}
      `
      yield* Deferred.succeed(releaseGeneration, undefined)
      yield* Fiber.join(fiber)

      assert.strictEqual(generationCalls, 1)
      assert.deepStrictEqual(renames, [])
      assert.deepStrictEqual(dispatched, [])
      assert.strictEqual(queries.length, 2)
      assert.isTrue(
        queries.some(
          (query) => query.includes("SELECT branch") && !query.includes("projection_turns"),
        ),
      )

      yield* reactor(
        persistedWorktreeEvent(
          ThreadTurnStarted.make({
            threadId: directZeroTurnThreadId,
            turnId: directZeroTurnEventId,
            text: "Zero-turn prompt",
          }),
          directZeroTurnThreadId,
        ),
      )
      yield* reactor(
        persistedWorktreeEvent(
          ThreadTurnStarted.make({
            threadId: directMultipleTurnThreadId,
            turnId: directMultipleTurnSecondId,
            text: "Multiple-turn prompt",
          }),
          directMultipleTurnThreadId,
        ),
      )
      yield* reactor(
        persistedWorktreeEvent(
          ThreadMetaUpdated.make({
            threadId: directMultipleTurnThreadId,
            branch: "noyau/other-name",
          }),
          directMultipleTurnThreadId,
        ),
      )
      assert.strictEqual(generationCalls, 1)
      assert.strictEqual(queries.length, 5)
      assert.isFalse(queries.some((query) => query.includes("projection_transcript")))

      yield* reactor(
        persistedWorktreeEvent(
          ThreadMetaUpdated.make({
            threadId: directMetaThreadId,
            worktreePath: "/tmp/worktrees/noyau/meta-bind",
          }),
          directMetaThreadId,
        ),
      )
      assert.strictEqual(generationCalls, 2)
      assert.deepStrictEqual(generationInputs[1], {
        cwd: "/tmp/worktrees/noyau/meta-bind",
        message: "[image: first.png]",
      })
      assert.deepStrictEqual(renames, [
        { oldBranch: "noyau/ab12cd34", newBranch: "noyau/attachment-prompt" },
      ])
      assert.strictEqual(dispatched.length, 1)
      assert.strictEqual(queries.length, 8)
      assert.strictEqual(
        queries.filter((query) => query.includes("projection_transcript")).length,
        1,
      )
    }),
  )
})
