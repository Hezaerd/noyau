import { createHash } from "node:crypto"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { memoryLayer } from "@noyau/database/sqlite"
import { ClientCommandRequest } from "@noyau/protocol/commands"
import { ActorId, ProjectId, ThreadId } from "@noyau/protocol/ids"
import { DEFAULT_THREAD_TITLE } from "@noyau/protocol/thread/title"
import { unavailableAgentSkillInstallerLayer } from "@noyau/server/agent-skill/installer"
import { ControlPlane, makeControlPlaneLayer } from "@noyau/server/control-plane"
import { noopDiscordPresenceLayer } from "@noyau/server/discord/presence"
import { GitRuntime, type GitRuntimeService } from "@noyau/server/git/git-runtime"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import {
  TextGeneration,
  type BranchNameGenerationInput,
} from "@noyau/server/text-generation/text-generation"
import { WorkspaceRootAccess } from "@noyau/server/workspace-root"
import { Crypto, Effect, Layer, Path, Schema, Stream } from "effect"

import { stubGitRuntimeLayer, testServerConfigLayer } from "./fixtures.ts"

const actorId = Schema.decodeSync(ActorId)("human:rpc-test")
const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const threadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001")

const uuid = (index: number) => `30000000-0000-4000-8000-${index.toString().padStart(12, "0")}`

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
  listRefs: () => Effect.succeed([]),
  listWorktrees: () => Effect.succeed([]),
  switchRef: (_cwd, refName) =>
    Effect.succeed({ refName, worktreePath: null, reusedWorktree: false }),
  createRef: (_cwd, refName) => Effect.succeed({ refName }),
  createWorktree: (input) =>
    Effect.succeed({ worktree: { path: `${input.worktreesDir}/stub`, refName: input.branch } }),
  removeWorktree: (input) => Effect.succeed({ path: input.path }),
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
) =>
  makeControlPlaneLayer().pipe(
    Layer.provideMerge(unavailableAgentSkillInstallerLayer),
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(unavailableProviderLayer),
    Layer.provideMerge(noopDiscordPresenceLayer),
    Layer.provideMerge(git),
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
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(layer(generate, git))
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
        assert.strictEqual(yield* readThreadBranch(controlPlane), "noyau/safer-reconnect-backoff")
      }),
    )
  })

  it.effect("leaves a non-temporary checkout unchanged", () =>
    run(
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
        assert.strictEqual(yield* readThreadBranch(controlPlane), "feature/manual")
      }),
    ),
  )

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
})
