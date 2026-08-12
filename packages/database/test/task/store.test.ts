import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import { migrationsLayer } from "@noyau/database/migrations"
import {
  executeTaskCommandRequest,
  readProjectEvents,
  readProjectTaskSnapshot,
  readTask,
} from "@noyau/database/task/store"
import { TaskAssignRequest, TaskCreateRequest } from "@noyau/protocol/commands"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  MissionId,
  ProjectId,
  TaskId,
} from "@noyau/protocol/ids"
import { Crypto, Effect, Layer, Option } from "effect"
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

const project = (suffix: string) =>
  ProjectId.make(`aaaaaaaa-0000-4000-8000-${suffix.padStart(12, "0")}`)
const task = (suffix: string) => TaskId.make(`bbbbbbbb-0000-4000-8000-${suffix.padStart(12, "0")}`)
const mission = (suffix: string) =>
  MissionId.make(`cccccccc-0000-4000-8000-${suffix.padStart(12, "0")}`)
const command = (suffix: string) =>
  CommandId.make(`dddddddd-0000-4000-8000-${suffix.padStart(12, "0")}`)

const human = ActorId.make("human:hezaerd")
const marion = ActorId.make("agent:marion")

const createFor = (
  taskId: TaskId,
  missionId: MissionId,
  commandId: CommandId,
  title = "Écrire la couche de persistance",
) =>
  TaskCreateRequest.make({
    commandId,
    payload: {
      taskId,
      missionId,
      title,
      acceptanceCriteria: ["transaction unique", "receipt stable"],
    },
  })

const assignFor = (taskId: TaskId, commandId: CommandId, causationId?: EventId) =>
  TaskAssignRequest.make({
    commandId,
    payload: { taskId, assigneeId: marion },
    ...(causationId === undefined ? {} : { causationId }),
  })

const execute = (
  request: TaskCreateRequest | TaskAssignRequest,
  projectId: ProjectId,
  actorId = human,
) => executeTaskCommandRequest({ request, projectId, actorId })

const countFor = (projectId: ProjectId, taskId: TaskId, table: "events" | "outbox") =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows =
      table === "events"
        ? yield* sql<{ total: number }>`
            SELECT count(*)::int AS total FROM events
            WHERE project_id = ${projectId}
              AND aggregate_type = 'task'
              AND aggregate_id = ${taskId}
          `
        : yield* sql<{ total: number }>`
            SELECT count(*)::int AS total FROM outbox
            JOIN events ON events.sequence = outbox.event_sequence
            WHERE events.project_id = ${projectId}
              AND events.aggregate_type = 'task'
              AND events.aggregate_id = ${taskId}
          `
    return rows[0]?.total ?? 0
  })

describe("executeTaskCommand", () => {
  layer(TestLayer, { timeout: "30 seconds" })((it) => {
    it.effect("audite la request canonique, le scope et la commande enrichie", () =>
      Effect.gen(function* () {
        const projectId = project("1")
        const taskId = task("1")
        const request = createFor(taskId, mission("1"), command("1"))

        const receipt = yield* execute(request, projectId)

        assert.strictEqual(receipt.response._tag, "accepted")
        assert.strictEqual(yield* countFor(projectId, taskId, "events"), 1)
        assert.strictEqual(yield* countFor(projectId, taskId, "outbox"), 1)

        const sql = yield* SqlClient
        const rows = yield* sql<{
          request: {
            _tag: string
            commandId: string
            projectId?: string
          }
          project_id: string
          actor_id: string
          command: {
            projectId: string
            actorId: string
            correlationId: string
            issuedAt: string
            schemaVersion: number
          }
        }>`
          SELECT request, project_id, actor_id, command
          FROM commands
          WHERE command_id = ${request.commandId}
        `
        const audit = rows[0]
        assert.isDefined(audit)
        if (audit !== undefined) {
          assert.strictEqual(audit.request._tag, "task.create")
          assert.strictEqual(audit.request.commandId, request.commandId)
          assert.isUndefined(audit.request.projectId)
          assert.strictEqual(audit.project_id, projectId)
          assert.strictEqual(audit.actor_id, human)
          assert.strictEqual(audit.command.projectId, projectId)
          assert.strictEqual(audit.command.actorId, human)
          assert.strictEqual(audit.command.correlationId, request.commandId)
          assert.strictEqual(audit.command.schemaVersion, 1)
          assert.match(audit.command.issuedAt, /^\d{4}-\d{2}-\d{2}T/)
        }
      }),
    )

    it.effect("rend le receipt original exact sur retry strict", () =>
      Effect.gen(function* () {
        const projectId = project("2")
        const taskId = task("2")
        const request = createFor(taskId, mission("2"), command("2"))

        const first = yield* execute(request, projectId)
        const second = yield* execute(request, projectId)

        assert.deepStrictEqual(second, first)
        assert.strictEqual(yield* countFor(projectId, taskId, "events"), 1)
        assert.strictEqual(yield* countFor(projectId, taskId, "outbox"), 1)
      }),
    )

    it.effect("préserve un receipt antérieur au journal de commandes", () =>
      Effect.gen(function* () {
        const projectId = project("16")
        const taskId = task("15")
        const missionId = mission("16")
        const commandId = command("22")
        const eventId = EventId.make("eeeeeeee-0000-4000-8000-000000000022")
        const request = createFor(taskId, missionId, commandId)
        const sql = yield* SqlClient
        yield* sql`
          INSERT INTO events (
            event_id, project_id, actor_id, correlation_id, causation_id,
            occurred_at, schema_version, aggregate_type, aggregate_id,
            aggregate_version, project_position, event
          ) VALUES (
            ${eventId}, ${projectId}, ${human}, ${commandId}, ${commandId},
            ${new Date("2026-08-12T12:00:00.000Z")}, 1, 'task', ${taskId}, 1, 1,
            ${JSON.stringify({ _tag: "task.created", ...request.payload })}::jsonb
          )
        `
        yield* sql`
          INSERT INTO receipts (command_id, response, created_at)
          VALUES (
            ${commandId},
            ${JSON.stringify({
              _tag: "accepted",
              eventIds: [eventId],
            })}::jsonb,
            ${new Date("2026-08-12T12:00:00.000Z")}
          )
        `

        const receipt = yield* execute(request, projectId)

        assert.strictEqual(receipt.response._tag, "accepted")
        if (receipt.response._tag === "accepted") {
          assert.deepStrictEqual(receipt.response.eventIds, [eventId])
        }
        const payloadConflict = yield* Effect.flip(
          execute(createFor(taskId, missionId, commandId, "Autre titre"), projectId),
        )
        const scopeConflict = yield* Effect.flip(execute(request, project("17")))
        assert.strictEqual(payloadConflict._tag, "CommandIdConflict")
        assert.strictEqual(scopeConflict._tag, "CommandIdConflict")
        assert.strictEqual(yield* countFor(projectId, taskId, "events"), 1)
        const commands = yield* sql<{ total: number }>`
          SELECT count(*)::int AS total
          FROM commands
          WHERE command_id = ${commandId}
        `
        assert.strictEqual(commands[0]?.total, 0)
      }),
    )

    it.effect("refuse la réutilisation du commandId avec une autre request", () =>
      Effect.gen(function* () {
        const projectId = project("3")
        const taskId = task("3")
        const commandId = command("3")
        yield* execute(createFor(taskId, mission("3"), commandId), projectId)

        const conflict = yield* Effect.flip(
          execute(createFor(taskId, mission("3"), commandId, "Autre titre"), projectId),
        )
        assert.strictEqual(conflict._tag, "CommandIdConflict")
        assert.strictEqual(yield* countFor(projectId, taskId, "events"), 1)
      }),
    )

    it.effect("refuse la réutilisation du commandId avec un autre scope", () =>
      Effect.gen(function* () {
        const firstProject = project("4")
        const secondProject = project("5")
        const request = createFor(task("4"), mission("4"), command("4"))
        yield* execute(request, firstProject)

        const projectConflict = yield* Effect.flip(execute(request, secondProject))
        assert.strictEqual(projectConflict._tag, "CommandIdConflict")

        const actorConflict = yield* Effect.flip(
          execute(request, firstProject, ActorId.make("human:other")),
        )
        assert.strictEqual(actorConflict._tag, "CommandIdConflict")
      }),
    )

    it.effect("hérite la corrélation d'une causalité du même projet", () =>
      Effect.gen(function* () {
        const projectId = project("6")
        const taskId = task("6")
        const created = yield* execute(createFor(taskId, mission("6"), command("6")), projectId)
        assert.strictEqual(created.response._tag, "accepted")
        if (created.response._tag !== "accepted") {
          return
        }
        const causationId = created.response.eventIds[0]
        assert.isDefined(causationId)
        if (causationId === undefined) {
          return
        }

        yield* execute(assignFor(taskId, command("7"), causationId), projectId)
        const events = yield* readProjectEvents(projectId, 0n)

        assert.strictEqual(events.length, 2)
        assert.strictEqual(events[0]?.event.correlationId, CorrelationId.make(command("6")))
        assert.strictEqual(events[1]?.event.correlationId, CorrelationId.make(command("6")))
      }),
    )

    it.effect("refuse une causalité absente du projet", () =>
      Effect.gen(function* () {
        const sourceProject = project("7")
        const targetProject = project("8")
        const taskId = task("7")
        const created = yield* execute(createFor(taskId, mission("7"), command("8")), sourceProject)
        assert.strictEqual(created.response._tag, "accepted")
        if (created.response._tag !== "accepted") {
          return
        }
        const causationId = created.response.eventIds[0]
        assert.isDefined(causationId)
        if (causationId === undefined) {
          return
        }

        const invalid = yield* Effect.flip(
          execute(assignFor(taskId, command("9"), causationId), targetProject),
        )
        assert.strictEqual(invalid._tag, "InvalidCausation")
      }),
    )

    it.effect("isole strictement deux tâches de même id par projet", () =>
      Effect.gen(function* () {
        const firstProject = project("9")
        const secondProject = project("10")
        const taskId = task("8")
        yield* execute(createFor(taskId, mission("8"), command("10"), "Premier"), firstProject)
        yield* execute(createFor(taskId, mission("9"), command("11"), "Second"), secondProject)

        const first = yield* readTask(firstProject, taskId)
        const second = yield* readTask(secondProject, taskId)
        assert.isTrue(Option.isSome(first))
        assert.isTrue(Option.isSome(second))
        if (Option.isSome(first) && Option.isSome(second)) {
          assert.strictEqual(first.value.title, "Premier")
          assert.strictEqual(second.value.title, "Second")
        }
        assert.strictEqual((yield* readProjectEvents(firstProject, 0n)).length, 1)
        assert.strictEqual((yield* readProjectEvents(secondProject, 0n)).length, 1)
      }),
    )

    it.effect("alloue versions agrégat et positions projet contiguës", () =>
      Effect.gen(function* () {
        const projectId = project("11")
        const taskId = task("9")
        yield* execute(createFor(taskId, mission("10"), command("12")), projectId)
        yield* execute(assignFor(taskId, command("13")), projectId)

        const events = yield* readProjectEvents(projectId, 0n)
        assert.deepStrictEqual(
          events.map((entry) => entry.position),
          [1n, 2n],
        )
        assert.deepStrictEqual(
          events.map((entry) => entry.event.event._tag),
          ["task.created", "task.assigned"],
        )

        const sql = yield* SqlClient
        const versions = yield* sql<{ aggregate_version: string }>`
          SELECT aggregate_version::text
          FROM events
          WHERE project_id = ${projectId}
            AND aggregate_type = 'task'
            AND aggregate_id = ${taskId}
          ORDER BY aggregate_version
        `
        assert.deepStrictEqual(
          versions.map((row) => row.aggregate_version),
          ["1", "2"],
        )
      }),
    )

    it.effect("lit un snapshot trié avec son high-water cohérent", () =>
      Effect.gen(function* () {
        const projectId = project("12")
        yield* execute(createFor(task("11"), mission("11"), command("14"), "Deuxième"), projectId)
        yield* execute(createFor(task("10"), mission("12"), command("15"), "Premier"), projectId)

        const snapshot = yield* readProjectTaskSnapshot(projectId)
        assert.strictEqual(snapshot.position, 2n)
        assert.deepStrictEqual(
          snapshot.tasks.map((entry) => entry.id),
          [task("10"), task("11")],
        )
      }),
    )

    it.effect("lit les événements après une position avec une limite", () =>
      Effect.gen(function* () {
        const projectId = project("13")
        const taskId = task("12")
        yield* execute(createFor(taskId, mission("13"), command("16")), projectId)
        yield* execute(assignFor(taskId, command("17")), projectId)

        const page = yield* readProjectEvents(projectId, 1n, 1)
        assert.strictEqual(page.length, 1)
        assert.strictEqual(page[0]?.position, 2n)
        assert.strictEqual(page[0]?.event.event._tag, "task.assigned")
      }),
    )

    it.effect("stabilise le rejet d'une seconde assignation", () =>
      Effect.gen(function* () {
        const projectId = project("14")
        const taskId = task("13")
        yield* execute(createFor(taskId, mission("14"), command("18")), projectId)
        yield* execute(assignFor(taskId, command("19")), projectId)

        const request = assignFor(taskId, command("20"))
        const first = yield* execute(request, projectId)
        const second = yield* execute(request, projectId)
        assert.deepStrictEqual(second, first)
        assert.strictEqual(first.response._tag, "rejected")
        if (first.response._tag === "rejected") {
          assert.strictEqual(first.response.error._tag, "TaskAlreadyAssigned")
          if (first.response.error._tag === "TaskAlreadyAssigned") {
            assert.strictEqual(first.response.error.assigneeId, marion)
          }
        }
        assert.strictEqual(yield* countFor(projectId, taskId, "events"), 2)
      }),
    )

    it.effect("sérialise deux retries concurrents sur PGlite", () =>
      Effect.gen(function* () {
        // PGlite exerce deux fibres mais sérialise son unique connexion. La
        // contention multi-connexion/row-lock reste un test d'intégration PG.
        const projectId = project("15")
        const taskId = task("14")
        const request = createFor(taskId, mission("15"), command("21"))
        const [first, second] = yield* Effect.all(
          [execute(request, projectId), execute(request, projectId)],
          { concurrency: "unbounded" },
        )

        assert.deepStrictEqual(second, first)
        assert.strictEqual(yield* countFor(projectId, taskId, "events"), 1)
      }),
    )
  })
})
