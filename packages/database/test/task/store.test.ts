import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import { migrationsLayer } from "@noyau/database/migrations"
import { executeTaskCommand, readTask } from "@noyau/database/task/store"
import { TaskAssign, TaskComplete, TaskCreate } from "@noyau/protocol/commands"
import {
  ActorId,
  CommandId,
  CorrelationId,
  MissionId,
  ProjectId,
  TaskId,
} from "@noyau/protocol/ids"
import { Crypto, DateTime, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Crypto déterministe : des UUIDs v4 valides et uniques, sans hasard. */
const testCrypto = () => {
  let counter = 0
  return Crypto.make({
    randomBytes: (size) => {
      const bytes = new Uint8Array(size)
      counter = counter + 1
      bytes[size - 1] = counter % 256
      bytes[size - 2] = (counter >> 8) % 256
      return bytes
    },
    digest: (_algorithm, data) => Effect.succeed(data),
  })
}

const ClientLayer = PgliteClient.layer({})
const MigrationsLayer = migrationsLayer.pipe(Layer.provide(ClientLayer))
const CryptoLayer = Layer.succeed(Crypto.Crypto)(testCrypto())
const TestLayer = Layer.mergeAll(ClientLayer, MigrationsLayer, CryptoLayer)

const projectId = ProjectId.make("aaaaaaaa-0000-4000-8000-000000000001")
const marion = ActorId.make("agent:marion")

const meta = (commandId: string) => ({
  commandId: CommandId.make(commandId),
  projectId,
  actorId: ActorId.make("human:hezaerd"),
  correlationId: CorrelationId.make("aaaaaaaa-0000-4000-8000-000000000002"),
  issuedAt: DateTime.makeUnsafe("2026-08-11T12:00:00.000Z"),
  schemaVersion: 1 as const,
})

const createFor = (taskId: TaskId, missionId: MissionId, commandId: string) =>
  TaskCreate.make({
    ...meta(commandId),
    payload: {
      taskId,
      missionId,
      title: "Écrire la couche de persistance",
      acceptanceCriteria: ["transaction unique", "receipt stable"],
    },
  })

const countFor = (taskId: TaskId, table: "events" | "outbox") =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows =
      table === "events"
        ? yield* sql<{ total: number }>`
            SELECT count(*)::int AS total FROM events
            WHERE aggregate_type = 'task' AND aggregate_id = ${taskId}
          `
        : yield* sql<{ total: number }>`
            SELECT count(*)::int AS total FROM outbox
            JOIN events ON events.sequence = outbox.event_sequence
            WHERE events.aggregate_type = 'task' AND events.aggregate_id = ${taskId}
          `
    return rows[0]?.total ?? 0
  })

describe("executeTaskCommand", () => {
  layer(TestLayer, { timeout: "30 seconds" })((it) => {
    it.effect("persiste event, receipt, outbox et projection pour task.create", () =>
      Effect.gen(function* () {
        const taskId = TaskId.make("bbbbbbbb-0000-4000-8000-000000000001")
        const missionId = MissionId.make("bbbbbbbb-0000-4000-8000-000000000002")
        const command = createFor(taskId, missionId, "bbbbbbbb-0000-4000-8000-000000000003")

        const receipt = yield* executeTaskCommand(command)

        assert.strictEqual(receipt.response._tag, "accepted")
        if (receipt.response._tag === "accepted") {
          assert.strictEqual(receipt.response.eventIds.length, 1)
        }
        assert.strictEqual(yield* countFor(taskId, "events"), 1)
        assert.strictEqual(yield* countFor(taskId, "outbox"), 1)

        const task = yield* readTask(taskId)
        assert.isTrue(Option.isSome(task))
        if (Option.isSome(task)) {
          assert.strictEqual(task.value.status, "proposed")
          assert.strictEqual(task.value.title, "Écrire la couche de persistance")
          assert.strictEqual(task.value.missionId, missionId)
        }
      }),
    )

    it.effect("rejoue le receipt sur retry de la même commande", () =>
      Effect.gen(function* () {
        const taskId = TaskId.make("cccccccc-0000-4000-8000-000000000001")
        const missionId = MissionId.make("cccccccc-0000-4000-8000-000000000002")
        const command = createFor(taskId, missionId, "cccccccc-0000-4000-8000-000000000003")

        const first = yield* executeTaskCommand(command)
        const second = yield* executeTaskCommand(command)

        assert.deepStrictEqual(second, first)
        assert.strictEqual(yield* countFor(taskId, "events"), 1)
        assert.strictEqual(yield* countFor(taskId, "outbox"), 1)
      }),
    )

    it.effect("rejette task.complete sur une tâche proposée, de façon stable", () =>
      Effect.gen(function* () {
        const taskId = TaskId.make("dddddddd-0000-4000-8000-000000000001")
        const missionId = MissionId.make("dddddddd-0000-4000-8000-000000000002")
        yield* executeTaskCommand(
          createFor(taskId, missionId, "dddddddd-0000-4000-8000-000000000003"),
        )

        const complete = TaskComplete.make({
          ...meta("dddddddd-0000-4000-8000-000000000004"),
          payload: { taskId, summary: "trop tôt" },
        })

        const first = yield* executeTaskCommand(complete)
        assert.strictEqual(first.response._tag, "rejected")
        if (first.response._tag === "rejected") {
          assert.strictEqual(first.response.error._tag, "InvalidTaskTransition")
        }

        const second = yield* executeTaskCommand(complete)
        assert.deepStrictEqual(second, first)
        assert.strictEqual(yield* countFor(taskId, "events"), 1)
      }),
    )

    it.effect("enchaîne create puis assign via replay du journal", () =>
      Effect.gen(function* () {
        const taskId = TaskId.make("eeeeeeee-0000-4000-8000-000000000001")
        const missionId = MissionId.make("eeeeeeee-0000-4000-8000-000000000002")
        yield* executeTaskCommand(
          createFor(taskId, missionId, "eeeeeeee-0000-4000-8000-000000000003"),
        )

        const assign = TaskAssign.make({
          ...meta("eeeeeeee-0000-4000-8000-000000000004"),
          payload: { taskId, assigneeId: marion },
        })
        const receipt = yield* executeTaskCommand(assign)

        assert.strictEqual(receipt.response._tag, "accepted")
        assert.strictEqual(yield* countFor(taskId, "events"), 2)
        assert.strictEqual(yield* countFor(taskId, "outbox"), 2)

        const task = yield* readTask(taskId)
        assert.isTrue(Option.isSome(task))
        if (Option.isSome(task)) {
          assert.strictEqual(task.value.assigneeId, marion)
        }
      }),
    )
  })
})
