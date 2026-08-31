import { createHash } from "node:crypto"

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it } from "@effect/vitest"
import { ClientCommandRequest } from "@noyau/contracts/commands"
import { ActorId, ProjectId } from "@noyau/contracts/ids"
import {
  WorkspaceRootConflict,
  WorkspaceRootNotDirectory,
  WorkspaceRootNotFound,
} from "@noyau/contracts/project/errors"
import { unavailableAgentSkillInstallerLayer } from "@noyau/server/agent-skill/installer"
import { commandFromRequest } from "@noyau/server/command-from-request"
import { ControlPlane, makeControlPlaneLayer } from "@noyau/server/control-plane"
import { noopDiscordPresenceLayer } from "@noyau/server/discord/presence"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import { unavailableProviderLayer } from "@noyau/server/provider/provider-port"
import { unavailableTextGenerationLayer } from "@noyau/server/text-generation/text-generation"
import { threadLiveLayer } from "@noyau/server/thread-live"
import { WorkspaceRootAccess, type WorkspaceRootAccessService } from "@noyau/server/workspace-root"
import { Crypto, Effect, Layer, Path, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { stubGitRuntimeLayer, stubVcsStatusBroadcasterLayer } from "./fixtures.ts"
import { testServerConfigLayer } from "./fixtures.ts"

const actorId = Schema.decodeSync(ActorId)("human:rpc-test")
const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const otherProjectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000002")

const uuid = (index: number) => `30000000-0000-4000-8000-${index.toString().padStart(12, "0")}`

const request = (input: (typeof ClientCommandRequest)["Encoded"]) =>
  Schema.decodeSync(ClientCommandRequest)(input)

const projectCreate = (commandId = uuid(1), id = projectId, workspaceRoot = "/tmp") =>
  request({
    _tag: "project.create",
    commandId,
    payload: { projectId: id, name: "Noyau", workspaceRoot },
  })

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

const availableWorkspaceRoots: WorkspaceRootAccessService = {
  isAvailable: () => Effect.succeed(true),
}

const commandFromRequestLayer = () =>
  memoryLayer.pipe(
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(NodeFileSystem.layer),
    Layer.provideMerge(Path.layer),
    Layer.provideMerge(Layer.succeed(Crypto.Crypto)(testCrypto())),
  )

const controlPlaneTestLayer = () =>
  makeControlPlaneLayer().pipe(
    Layer.provideMerge(unavailableAgentSkillInstallerLayer),
    Layer.provideMerge(memoryLayer),
    Layer.provideMerge(testServerConfigLayer()),
    Layer.provideMerge(unavailableProviderLayer),
    Layer.provideMerge(threadLiveLayer),
    Layer.provideMerge(unavailableTextGenerationLayer),
    Layer.provideMerge(noopDiscordPresenceLayer),
    Layer.provideMerge(stubGitRuntimeLayer),
    Layer.provideMerge(stubVcsStatusBroadcasterLayer()),
    Layer.provideMerge(Layer.succeed(WorkspaceRootAccess)(availableWorkspaceRoots)),
    Layer.provideMerge(NodeFileSystem.layer),
    Layer.provideMerge(Path.layer),
    Layer.provide(Layer.succeed(Crypto.Crypto)(testCrypto())),
  )

const runCommandFromRequest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(commandFromRequestLayer())
      return yield* effect.pipe(Effect.provide(services))
    }),
  )

const runDispatch = <A, E>(effect: Effect.Effect<A, E, ControlPlane | SqlClient>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const services = yield* Layer.build(controlPlaneTestLayer())
      return yield* effect.pipe(Effect.provide(services))
    }),
  )

describe("ingress", () => {
  it.effect("commandFromRequest rejects missing and non-directory WorkspaceRoots", () =>
    runCommandFromRequest(
      Effect.gen(function* () {
        const missing = `/tmp/noyau-missing-${uuid(90)}`
        const missingCreate = yield* commandFromRequest(
          projectCreate(uuid(1), projectId, missing),
          actorId,
        ).pipe(Effect.flip)
        const fileCreate = yield* commandFromRequest(
          projectCreate(uuid(2), projectId, "/etc/hosts"),
          actorId,
        ).pipe(Effect.flip)
        assert.instanceOf(missingCreate, WorkspaceRootNotFound)
        assert.strictEqual(missingCreate.workspaceRoot, missing)
        assert.instanceOf(fileCreate, WorkspaceRootNotDirectory)
        assert.strictEqual(fileCreate.workspaceRoot, "/etc/hosts")

        const created = yield* commandFromRequest(projectCreate(), actorId)
        assert.strictEqual(created._tag, "project.create")
        assert.strictEqual(created.schemaVersion, 1)
        assert.strictEqual(created.actorId, actorId)
        assert.strictEqual(created.correlationId, uuid(1))
        if (created._tag === "project.create") {
          assert.notStrictEqual(
            created.initialBoard.backlogColumnId,
            created.initialBoard.activeColumnId,
          )
          assert.notStrictEqual(
            created.initialBoard.backlogColumnId,
            created.initialBoard.doneColumnId,
          )
          assert.notStrictEqual(
            created.initialBoard.activeColumnId,
            created.initialBoard.doneColumnId,
          )
        }
      }),
    ),
  )

  it.effect("does not journal missing or non-directory WorkspaceRoot rejections", () =>
    runDispatch(
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const sql = yield* SqlClient
        const missing = `/tmp/noyau-missing-${uuid(90)}`
        const missingCreateRequest = projectCreate(uuid(1), projectId, missing)
        const fileCreateRequest = projectCreate(uuid(2), projectId, "/etc/hosts")
        const missingCreate = yield* controlPlane
          .dispatch(missingCreateRequest, actorId)
          .pipe(Effect.flip)
        const missingCreateRetry = yield* controlPlane
          .dispatch(missingCreateRequest, actorId)
          .pipe(Effect.flip)
        const fileCreate = yield* controlPlane
          .dispatch(fileCreateRequest, actorId)
          .pipe(Effect.flip)
        const fileCreateRetry = yield* controlPlane
          .dispatch(fileCreateRequest, actorId)
          .pipe(Effect.flip)
        assert.instanceOf(missingCreate, WorkspaceRootNotFound)
        assert.deepStrictEqual(missingCreateRetry, missingCreate)
        assert.instanceOf(fileCreate, WorkspaceRootNotDirectory)
        assert.deepStrictEqual(fileCreateRetry, fileCreate)

        yield* controlPlane.dispatch(projectCreate(uuid(3), projectId, "/tmp"), actorId)
        const missingRebindRequest = request({
          _tag: "project.rebind",
          commandId: uuid(4),
          payload: { projectId, workspaceRoot: missing },
        })
        const missingRebind = yield* controlPlane
          .dispatch(missingRebindRequest, actorId)
          .pipe(Effect.flip)
        const missingRebindRetry = yield* controlPlane
          .dispatch(missingRebindRequest, actorId)
          .pipe(Effect.flip)
        assert.instanceOf(missingRebind, WorkspaceRootNotFound)
        assert.deepStrictEqual(missingRebindRetry, missingRebind)

        const receipts = yield* sql<{ response: string }>`
          SELECT response
          FROM receipts
          WHERE command_id IN (${uuid(1)}, ${uuid(2)}, ${uuid(4)})
          ORDER BY command_id
        `
        assert.strictEqual(receipts.length, 0)
      }),
    ),
  )

  it.effect("persists stable WorkspaceRootConflict receipts for create and rebind", () =>
    runDispatch(
      Effect.gen(function* () {
        const controlPlane = yield* ControlPlane
        const sql = yield* SqlClient
        yield* controlPlane.dispatch(projectCreate(uuid(1), projectId, "/tmp"), actorId)

        const conflictingCreate = projectCreate(uuid(2), otherProjectId, "/tmp")
        const createError = yield* controlPlane
          .dispatch(conflictingCreate, actorId)
          .pipe(Effect.flip)
        const createRetry = yield* controlPlane
          .dispatch(conflictingCreate, actorId)
          .pipe(Effect.flip)
        assert.instanceOf(createError, WorkspaceRootConflict)
        assert.deepStrictEqual(createRetry, createError)
        assert.strictEqual(createError._tag, "WorkspaceRootConflict")
        assert.strictEqual(createError.workspaceRoot, "/tmp")
        assert.strictEqual(createError.projectId, projectId)

        yield* controlPlane.dispatch(projectCreate(uuid(3), otherProjectId, "/"), actorId)
        const rebind = request({
          _tag: "project.rebind",
          commandId: uuid(4),
          payload: { projectId: otherProjectId, workspaceRoot: "/tmp" },
        })
        const rebindError = yield* controlPlane.dispatch(rebind, actorId).pipe(Effect.flip)
        const rebindRetry = yield* controlPlane.dispatch(rebind, actorId).pipe(Effect.flip)
        assert.instanceOf(rebindError, WorkspaceRootConflict)
        assert.deepStrictEqual(rebindRetry, rebindError)
        assert.strictEqual(rebindError._tag, "WorkspaceRootConflict")

        const receipts = yield* sql<{ response: string }>`
          SELECT response
          FROM receipts
          WHERE command_id IN (${uuid(2)}, ${uuid(4)})
          ORDER BY command_id
        `
        assert.strictEqual(receipts.length, 2)
        assert.isTrue(receipts.every((row) => row.response.includes('"WorkspaceRootConflict"')))
      }),
    ),
  )
})
