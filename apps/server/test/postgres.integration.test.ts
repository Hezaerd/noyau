import * as PgClient from "@effect/sql-pg/PgClient"
import { assert, layer } from "@effect/vitest"
import { migrationsLayer } from "@noyau/database/migrations"
import {
  executeTaskCommandRequest,
  readProjectEvents,
  readProjectTaskSnapshot,
} from "@noyau/database/task/store"
import {
  TaskAssignRequest,
  TaskCreateRequest,
  type TaskAssignRequest as TaskAssignRequestType,
  type TaskCreateRequest as TaskCreateRequestType,
} from "@noyau/protocol/commands"
import {
  InvalidEventCursor,
  InvalidRequest,
  ProjectTaskSnapshot,
} from "@noyau/protocol/control-plane"
import { EventEnvelope } from "@noyau/protocol/events"
import { ActorId, CommandId, MissionId, ProjectId, TaskId } from "@noyau/protocol/ids"
import { Receipt } from "@noyau/protocol/receipts"
import { ServerConfig, type ServerConfigValue } from "@noyau/server/config"
import { serverRoutesLayer } from "@noyau/server/server"
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { Crypto, Effect, Layer, ManagedRuntime, Redacted, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { afterAll, beforeAll } from "vite-plus/test"

let container: StartedPostgreSqlContainer

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17-alpine").start()
})

afterAll(async () => {
  await container?.stop()
})

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const taskId = TaskId.make("20000000-0000-4000-8000-000000000001")
const missionId = MissionId.make("30000000-0000-4000-8000-000000000001")
const createCommandId = CommandId.make("40000000-0000-4000-8000-000000000001")
const firstAssignCommandId = CommandId.make("40000000-0000-4000-8000-000000000002")
const secondAssignCommandId = CommandId.make("40000000-0000-4000-8000-000000000003")
const concurrencyProjectId = ProjectId.make("10000000-0000-4000-8000-000000000002")
const concurrencyTaskId = TaskId.make("20000000-0000-4000-8000-000000000002")
const concurrencyMissionId = MissionId.make("30000000-0000-4000-8000-000000000002")
const concurrencyCreateCommandId = CommandId.make("40000000-0000-4000-8000-000000000004")
const concurrencyFirstAssignCommandId = CommandId.make("40000000-0000-4000-8000-000000000005")
const concurrencySecondAssignCommandId = CommandId.make("40000000-0000-4000-8000-000000000006")
const actorId = ActorId.make("human:integration")
const assigneeId = ActorId.make("agent:marion")

const createRequest = TaskCreateRequest.make({
  commandId: createCommandId,
  payload: {
    taskId,
    missionId,
    title: "Validate PostgreSQL concurrency",
    acceptanceCriteria: ["one durable decision"],
  },
})

const concurrencyCreateRequest = TaskCreateRequest.make({
  commandId: concurrencyCreateCommandId,
  payload: {
    taskId: concurrencyTaskId,
    missionId: concurrencyMissionId,
    title: "Serialize PostgreSQL commands",
    acceptanceCriteria: ["one durable decision"],
  },
})

const assignRequest = (targetTaskId: TaskId, commandId: CommandId) =>
  TaskAssignRequest.make({
    commandId,
    payload: { taskId: targetTaskId, assigneeId },
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
    digest: (_algorithm, data) => Effect.succeed(data),
  })
}

const crypto = testCrypto()

const databaseLayer = () =>
  Layer.unwrap(
    Effect.sync(() => {
      const postgres = PgClient.layer({
        url: Redacted.make(container.getConnectionUri()),
        maxConnections: 10,
      })
      return Layer.mergeAll(
        migrationsLayer,
        Layer.succeed(Crypto.Crypto)(crypto),
        Layer.succeed(ServerConfig)({
          environment: "test",
          databaseUrl: Redacted.make(container.getConnectionUri()),
          host: "127.0.0.1",
          port: 0,
          eventPollInterval: 1,
        } satisfies ServerConfigValue),
      ).pipe(Layer.provideMerge(postgres))
    }),
  )

const configLayer = () =>
  Layer.succeed(ServerConfig)({
    environment: "test",
    databaseUrl: Redacted.make(container.getConnectionUri()),
    host: "127.0.0.1",
    port: 0,
    eventPollInterval: 1,
  } satisfies ServerConfigValue)

const execute = (
  request: TaskCreateRequestType | TaskAssignRequestType,
  targetProjectId = projectId,
) => executeTaskCommandRequest({ request, projectId: targetProjectId, actorId })

const readFirstSseFrame = async (response: Response) => {
  const reader = response.body?.getReader()
  assert.isDefined(reader)
  if (reader === undefined) {
    throw new Error("SSE response has no body")
  }

  const decoder = new TextDecoder()
  const readUntilFrame = async (body: string): Promise<string> => {
    const end = body.indexOf("\n\n")
    if (end !== -1) {
      return body.slice(0, end)
    }
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for SSE event")), 5_000),
      ),
    ])
    if (chunk.done) {
      throw new Error("SSE stream ended before its first event")
    }
    return readUntilFrame(body + decoder.decode(chunk.value, { stream: true }))
  }

  try {
    return await readUntilFrame("")
  } finally {
    await reader.cancel()
  }
}

layer(databaseLayer(), { timeout: "120 seconds" })((it) => {
  it("serves health checks and protects project routes", async () => {
    const webLayer = serverRoutesLayer.pipe(
      Layer.provide(HttpServer.layerServices),
      Layer.provide(configLayer()),
    )
    const runtime = ManagedRuntime.make(databaseLayer())
    const context = await runtime.context()
    const { dispose, handler } = HttpRouter.toWebHandler(webLayer, {
      disableLogger: true,
    })

    try {
      const [live, ready, missingIdentity] = await Promise.all([
        handler(new Request("http://localhost/health/live"), context),
        handler(new Request("http://localhost/health/ready"), context),
        handler(new Request(`http://localhost/api/v1/projects/${projectId}/tasks`), context),
      ])
      assert.strictEqual(live.status, 200)
      assert.strictEqual(ready.status, 200)
      assert.strictEqual(missingIdentity.status, 401)

      const authHeaders = {
        "content-type": "application/json",
        "x-noyau-actor-id": actorId,
      }
      const emptySnapshotResponse = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/tasks`, {
          headers: authHeaders,
        }),
        context,
      )
      const emptySnapshot = Schema.decodeUnknownSync(ProjectTaskSnapshot)(
        await emptySnapshotResponse.json(),
      )
      assert.strictEqual(emptySnapshot.tasks.length, 0)

      const missingCursor = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/events`, {
          headers: authHeaders,
        }),
        context,
      )
      assert.strictEqual(missingCursor.status, 400)
      assert.instanceOf(
        Schema.decodeUnknownSync(InvalidEventCursor)(await missingCursor.json()),
        InvalidEventCursor,
      )

      const invalidPayload = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/commands`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            _tag: "task.complete",
            commandId: createCommandId,
            payload: { taskId },
          }),
        }),
        context,
      )
      assert.strictEqual(invalidPayload.status, 400)
      assert.instanceOf(
        Schema.decodeUnknownSync(InvalidRequest)(await invalidPayload.json()),
        InvalidRequest,
      )

      const missingAcceptanceCriteria = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/commands`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            _tag: "task.create",
            commandId: "40000000-0000-4000-8000-000000000007",
            payload: {
              taskId: "20000000-0000-4000-8000-000000000007",
              missionId,
              title: "Unbounded task",
              acceptanceCriteria: [],
            },
          }),
        }),
        context,
      )
      assert.strictEqual(missingAcceptanceCriteria.status, 400)
      assert.instanceOf(
        Schema.decodeUnknownSync(InvalidRequest)(await missingAcceptanceCriteria.json()),
        InvalidRequest,
      )

      const eventsResponsePromise = handler(
        new Request(
          `http://localhost/api/v1/projects/${projectId}/events?cursor=ignored-invalid-query`,
          {
            headers: {
              ...authHeaders,
              "last-event-id": emptySnapshot.cursor,
            },
          },
        ),
        context,
      )
      const created = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/commands`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(createRequest),
        }),
        context,
      )
      assert.strictEqual(created.status, 200)
      const createdReceipt = Schema.decodeUnknownSync(Receipt)(await created.json())

      const eventsResponse = await eventsResponsePromise
      assert.strictEqual(eventsResponse.status, 200)
      const firstFrame = await readFirstSseFrame(eventsResponse)
      const idLine = firstFrame.split("\n").find((line) => line.startsWith("id: "))
      const dataLine = firstFrame.split("\n").find((line) => line.startsWith("data: "))
      assert.strictEqual(idLine, `id: v1.${projectId}.1`)
      assert.isDefined(dataLine)
      if (dataLine === undefined) {
        throw new Error("SSE event has no data")
      }
      const envelope = Schema.decodeSync(Schema.fromJsonString(EventEnvelope))(
        dataLine.slice("data: ".length),
      )
      assert.strictEqual(envelope.event._tag, "task.created")

      const retry = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/commands`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(createRequest),
        }),
        context,
      )
      assert.strictEqual(retry.status, 200)
      assert.deepStrictEqual(Schema.decodeUnknownSync(Receipt)(await retry.json()), createdReceipt)

      const conflictingRequest = TaskCreateRequest.make({
        ...createRequest,
        payload: {
          ...createRequest.payload,
          title: "Conflicting reuse",
        },
      })
      const conflict = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/commands`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(conflictingRequest),
        }),
        context,
      )
      assert.strictEqual(conflict.status, 409)

      const firstAssignment = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/commands`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(assignRequest(taskId, firstAssignCommandId)),
        }),
        context,
      )
      const secondAssignment = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/commands`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(assignRequest(taskId, secondAssignCommandId)),
        }),
        context,
      )
      assert.strictEqual(firstAssignment.status, 200)
      assert.strictEqual(secondAssignment.status, 200)
      assert.strictEqual(
        Schema.decodeUnknownSync(Receipt)(await firstAssignment.json()).response._tag,
        "accepted",
      )
      const rejectedAssignment = Schema.decodeUnknownSync(Receipt)(await secondAssignment.json())
      assert.strictEqual(rejectedAssignment.response._tag, "rejected")
      if (rejectedAssignment.response._tag === "rejected") {
        assert.strictEqual(rejectedAssignment.response.error._tag, "TaskAlreadyAssigned")
      }

      const populatedSnapshotResponse = await handler(
        new Request(`http://localhost/api/v1/projects/${projectId}/tasks`, {
          headers: authHeaders,
        }),
        context,
      )
      const populatedSnapshot = Schema.decodeUnknownSync(ProjectTaskSnapshot)(
        await populatedSnapshotResponse.json(),
      )
      assert.strictEqual(populatedSnapshot.tasks.length, 1)
      assert.strictEqual(populatedSnapshot.tasks[0]?.assigneeId, assigneeId)
    } finally {
      await dispose()
      await runtime.dispose()
    }
  })

  it.effect("migrates and serializes concurrent idempotent commands", () =>
    Effect.gen(function* () {
      const retries = yield* Effect.all(
        Array.from({ length: 8 }, () => execute(concurrencyCreateRequest, concurrencyProjectId)),
        { concurrency: "unbounded" },
      )
      assert.strictEqual(retries.length, 8)
      assert.isTrue(
        retries.every(
          (receipt) =>
            receipt.response._tag === "accepted" && receipt.response.eventIds.length === 1,
        ),
      )
      assert.deepStrictEqual(retries.slice(1), retries.slice(0, -1))

      const afterCreate = yield* readProjectTaskSnapshot(concurrencyProjectId)
      const createEvents = yield* readProjectEvents(concurrencyProjectId, 0n)
      assert.strictEqual(afterCreate.tasks.length, 1)
      assert.strictEqual(afterCreate.position, 1n)
      assert.strictEqual(createEvents.length, 1)

      const assignments = yield* Effect.all(
        [
          execute(
            assignRequest(concurrencyTaskId, concurrencyFirstAssignCommandId),
            concurrencyProjectId,
          ),
          execute(
            assignRequest(concurrencyTaskId, concurrencySecondAssignCommandId),
            concurrencyProjectId,
          ),
        ],
        { concurrency: "unbounded" },
      )
      assert.deepStrictEqual(assignments.map((receipt) => receipt.response._tag).toSorted(), [
        "accepted",
        "rejected",
      ])

      const rejected = assignments.find((receipt) => receipt.response._tag === "rejected")
      assert.isDefined(rejected)
      const rejectedRequest =
        rejected.commandId === concurrencyFirstAssignCommandId
          ? assignRequest(concurrencyTaskId, concurrencyFirstAssignCommandId)
          : assignRequest(concurrencyTaskId, concurrencySecondAssignCommandId)
      assert.deepStrictEqual(yield* execute(rejectedRequest, concurrencyProjectId), rejected)

      const finalSnapshot = yield* readProjectTaskSnapshot(concurrencyProjectId)
      const finalEvents = yield* readProjectEvents(concurrencyProjectId, 0n)
      assert.strictEqual(finalSnapshot.tasks[0]?.assigneeId, assigneeId)
      assert.strictEqual(finalSnapshot.position, 2n)
      assert.strictEqual(finalEvents.length, 2)
    }),
  )
})
