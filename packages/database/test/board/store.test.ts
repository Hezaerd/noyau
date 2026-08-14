import { PgliteClient } from "@effect/sql-pglite"
import { assert, describe, layer } from "@effect/vitest"
import {
  executeBoardInitialize,
  executeTicketCommandRequest,
  readProjectBoardSnapshot,
} from "@noyau/database/board/store"
import { migrationsLayer } from "@noyau/database/migrations"
import { readProjectEvents } from "@noyau/database/project-stream"
import { KanbanColumn } from "@noyau/protocol/entities/kanban-column"
import { Ticket } from "@noyau/protocol/entities/ticket"
import {
  ActorId,
  AgentProfileId,
  CommandId,
  CorrelationId,
  ExecutionId,
  KanbanColumnId,
  ProjectId,
  ThreadId,
  TicketId,
} from "@noyau/protocol/ids"
import {
  TicketCommandRequest,
  type TicketCommandRequest as TicketCommandRequestType,
} from "@noyau/protocol/ticket/commands"
import { Crypto, Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

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

const uuid = (prefix: string, suffix: number) =>
  `${prefix}-0000-4000-8000-${suffix.toString().padStart(12, "0")}`
const project = (suffix: number) => ProjectId.make(uuid("aaaaaaaa", suffix))
const column = (suffix: number) => KanbanColumnId.make(uuid("bbbbbbbb", suffix))
const ticket = (suffix: number) => TicketId.make(uuid("cccccccc", suffix))
const thread = (suffix: number) => ThreadId.make(uuid("dddddddd", suffix))
const command = (suffix: number) => CommandId.make(uuid("eeeeeeee", suffix))
const execution = (suffix: number) => ExecutionId.make(uuid("ffffffff", suffix))
const profile = (suffix: number) => AgentProfileId.make(uuid("99999999", suffix))

const human = ActorId.make("human:hezaerd")
const agent = ActorId.make("agent:marion")

const request = (input: TicketCommandRequestType) => Schema.decodeSync(TicketCommandRequest)(input)

const execute = (projectId: ProjectId, commandRequest: TicketCommandRequestType, actorId = human) =>
  executeTicketCommandRequest({ request: commandRequest, projectId, actorId })

const initialize = (
  projectId: ProjectId,
  commandId: CommandId,
  backlogColumnId: KanbanColumnId,
  activeColumnId: KanbanColumnId,
  doneColumnId: KanbanColumnId,
) =>
  executeBoardInitialize({
    commandId,
    projectId,
    actorId: human,
    backlogColumnId,
    activeColumnId,
    doneColumnId,
  })

const createTicket = (
  commandId: CommandId,
  ticketId: TicketId,
  workbenchThreadId: ThreadId,
  columnId: KanbanColumnId,
  title = "Ticket",
) =>
  request({
    _tag: "ticket.create",
    commandId,
    payload: {
      ticketId,
      workbenchThreadId,
      title,
      placement: { columnId },
    },
  })

const countBoardRows = (projectId: ProjectId, table: "events" | "outbox") =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows =
      table === "events"
        ? yield* sql<{ total: number }>`
            SELECT count(*)::int AS total
            FROM events
            WHERE project_id = ${projectId}
              AND aggregate_type = 'board'
              AND aggregate_id = ${projectId}
          `
        : yield* sql<{ total: number }>`
            SELECT count(*)::int AS total
            FROM outbox
            JOIN events ON events.sequence = outbox.event_sequence
            WHERE events.project_id = ${projectId}
              AND events.aggregate_type = 'board'
              AND events.aggregate_id = ${projectId}
          `
    return rows[0]?.total ?? 0
  })

describe("board store", () => {
  layer(TestLayer, { timeout: "30 seconds" })((it) => {
    it.effect("initialise, audite et rejoue strictement un Tableau durable", () =>
      Effect.gen(function* () {
        const projectId = project(1)
        const commandId = command(1)
        const backlog = column(1)
        const active = column(2)
        const done = column(3)

        const first = yield* initialize(projectId, commandId, backlog, active, done)
        const second = yield* initialize(projectId, commandId, backlog, active, done)

        assert.deepStrictEqual(second, first)
        assert.strictEqual(first.response._tag, "accepted")
        if (first.response._tag === "accepted") {
          assert.strictEqual(first.response.eventIds.length, 3)
        }
        assert.strictEqual(yield* countBoardRows(projectId, "events"), 3)
        assert.strictEqual(yield* countBoardRows(projectId, "outbox"), 3)

        const sql = yield* SqlClient
        const audits = yield* sql<{
          request: { _tag: string; projectId?: string }
          project_id: string
          actor_id: string
          command: {
            _tag: string
            projectId: string
            actorId: string
            correlationId: string
            schemaVersion: number
          }
        }>`
          SELECT request, project_id, actor_id, command
          FROM commands
          WHERE command_id = ${commandId}
        `
        const audit = audits[0]
        assert.isDefined(audit)
        if (audit !== undefined) {
          assert.strictEqual(audit.request._tag, "board.initialize")
          assert.isUndefined(audit.request.projectId)
          assert.strictEqual(audit.project_id, projectId)
          assert.strictEqual(audit.actor_id, human)
          assert.strictEqual(audit.command._tag, "board.initialize")
          assert.strictEqual(audit.command.projectId, projectId)
          assert.strictEqual(audit.command.actorId, human)
          assert.strictEqual(audit.command.correlationId, commandId)
          assert.strictEqual(audit.command.schemaVersion, 1)
        }

        const heads = yield* sql<{ version: string }>`
          SELECT version::text
          FROM aggregate_heads
          WHERE project_id = ${projectId}
            AND aggregate_type = 'board'
            AND aggregate_id = ${projectId}
        `
        assert.strictEqual(heads[0]?.version, "3")

        const snapshot = yield* readProjectBoardSnapshot(projectId)
        assert.strictEqual(snapshot.cursor, `v1.${projectId}.3`)
        assert.deepStrictEqual(
          snapshot.columns.map((entry) => entry.name),
          ["Backlog", "En cours", "Done"],
        )
        assert.isTrue(snapshot.columns.every(Schema.is(KanbanColumn)))
        assert.deepStrictEqual(snapshot.tickets, [])
      }),
    )

    it.effect("stabilise les rejets et refuse tout commandId réutilisé hors requête exacte", () =>
      Effect.gen(function* () {
        const projectId = project(2)
        const backlog = column(11)
        const active = column(12)
        const done = column(13)
        yield* initialize(projectId, command(10), backlog, active, done)

        const rejectedCommand = command(11)
        const firstRejection = yield* initialize(
          projectId,
          rejectedCommand,
          column(14),
          column(15),
          column(16),
        )
        const retriedRejection = yield* initialize(
          projectId,
          rejectedCommand,
          column(14),
          column(15),
          column(16),
        )
        assert.deepStrictEqual(retriedRejection, firstRejection)
        assert.strictEqual(firstRejection.response._tag, "rejected")
        if (firstRejection.response._tag === "rejected") {
          assert.strictEqual(firstRejection.response.error._tag, "KanbanColumnAlreadyExists")
        }
        assert.strictEqual(yield* countBoardRows(projectId, "events"), 3)

        const ticketId = ticket(10)
        const createCommand = command(12)
        const original = createTicket(createCommand, ticketId, thread(10), backlog, "Original")
        yield* execute(projectId, original)

        const payloadConflict = yield* Effect.flip(
          execute(projectId, createTicket(createCommand, ticketId, thread(10), backlog, "Modifié")),
        )
        const actorConflict = yield* Effect.flip(execute(projectId, original, agent))
        const projectConflict = yield* Effect.flip(execute(project(3), original))
        assert.strictEqual(payloadConflict._tag, "CommandIdConflict")
        assert.strictEqual(actorConflict._tag, "CommandIdConflict")
        assert.strictEqual(projectConflict._tag, "CommandIdConflict")
      }),
    )

    it.effect("hérite la corrélation et rejette une causalité étrangère au projet", () =>
      Effect.gen(function* () {
        const projectId = project(4)
        const otherProjectId = project(5)
        const backlog = column(21)
        const active = column(22)
        const done = column(23)
        const rootCommand = command(20)
        const initialized = yield* initialize(projectId, rootCommand, backlog, active, done)
        assert.strictEqual(initialized.response._tag, "accepted")
        if (initialized.response._tag !== "accepted") {
          return
        }
        const causationId = initialized.response.eventIds[0]
        assert.isDefined(causationId)
        if (causationId === undefined) {
          return
        }

        const create = request({
          ...createTicket(command(21), ticket(20), thread(20), backlog),
          causationId,
        })
        yield* execute(projectId, create)
        const events = yield* readProjectEvents(projectId, 0n)
        assert.strictEqual(events.at(-1)?.event.correlationId, CorrelationId.make(rootCommand))

        const foreign = yield* Effect.flip(
          execute(
            otherProjectId,
            request({
              ...createTicket(command(22), ticket(21), thread(21), column(24)),
              causationId,
            }),
          ),
        )
        assert.strictEqual(foreign._tag, "InvalidCausation")
      }),
    )

    it.effect("projette toutes les commandes Ticket, dépendance et execution.start", () =>
      Effect.gen(function* () {
        const projectId = project(6)
        const backlog = column(31)
        const active = column(32)
        const done = column(33)
        const firstTicket = ticket(30)
        const secondTicket = ticket(31)
        yield* initialize(projectId, command(30), backlog, active, done)
        yield* execute(
          projectId,
          createTicket(command(31), firstTicket, thread(30), backlog, "Premier"),
        )
        yield* execute(
          projectId,
          createTicket(command(32), secondTicket, thread(31), backlog, "Prérequis"),
        )

        yield* execute(
          projectId,
          request({
            _tag: "ticket.update",
            commandId: command(33),
            payload: {
              ticketId: firstTicket,
              title: "Premier modifié",
              description: "Description",
              priority: "urgent",
              dueAt: "2026-09-01T12:00:00.000Z",
            },
          }),
        )
        yield* execute(
          projectId,
          request({
            _tag: "ticket.assign",
            commandId: command(34),
            payload: { ticketId: firstTicket, assigneeId: agent },
          }),
        )
        yield* execute(
          projectId,
          request({
            _tag: "ticket.move",
            commandId: command(35),
            payload: { ticketId: firstTicket, placement: { columnId: active } },
          }),
        )
        yield* execute(
          projectId,
          request({
            _tag: "ticket.dependency.add",
            commandId: command(36),
            payload: { ticketId: firstTicket, dependsOnTicketId: secondTicket },
          }),
        )

        const blockedRequest = request({
          _tag: "execution.start",
          commandId: command(37),
          payload: {
            executionId: execution(30),
            ticketId: firstTicket,
            expectedOutcome: "Une migration durable",
            agentProfileId: profile(30),
            budget: { maxTokens: 20_000, timeoutSeconds: 1_800 },
            toolPolicy: { allowed: ["read", "edit"] },
          },
        })
        const blocked = yield* execute(projectId, blockedRequest)
        const blockedRetry = yield* execute(projectId, blockedRequest)
        assert.deepStrictEqual(blockedRetry, blocked)
        assert.strictEqual(blocked.response._tag, "rejected")
        if (blocked.response._tag === "rejected") {
          assert.strictEqual(blocked.response.error._tag, "ExecutionBlockedByDependencies")
        }

        yield* execute(
          projectId,
          request({
            _tag: "ticket.dependency.remove",
            commandId: command(38),
            payload: { ticketId: firstTicket, dependsOnTicketId: secondTicket },
          }),
        )
        yield* execute(
          projectId,
          request({
            ...blockedRequest,
            commandId: command(39),
          }),
        )

        const confirmation = yield* execute(
          projectId,
          request({
            _tag: "ticket.complete",
            commandId: command(40),
            payload: { ticketId: firstTicket },
          }),
        )
        assert.strictEqual(confirmation.response._tag, "rejected")
        if (confirmation.response._tag === "rejected") {
          assert.strictEqual(
            confirmation.response.error._tag,
            "ActiveExecutionConfirmationRequired",
          )
        }

        const completed = yield* execute(
          projectId,
          request({
            _tag: "ticket.complete",
            commandId: command(41),
            payload: { ticketId: firstTicket, interruptActiveExecution: true },
          }),
        )
        assert.strictEqual(completed.response._tag, "accepted")
        if (completed.response._tag === "accepted") {
          assert.strictEqual(completed.response.eventIds.length, 2)
        }

        let snapshot = yield* readProjectBoardSnapshot(projectId)
        const projected = snapshot.tickets.find((entry) => entry.id === firstTicket)
        assert.isDefined(projected)
        if (projected !== undefined) {
          assert.isTrue(Schema.is(Ticket)(projected))
          assert.strictEqual(projected.title, "Premier modifié")
          assert.strictEqual(projected.description, "Description")
          assert.strictEqual(projected.priority, "urgent")
          assert.strictEqual(projected.assigneeId, agent)
          assert.strictEqual(projected.columnId, done)
          assert.strictEqual(projected.done, true)
          assert.strictEqual(projected.lastActiveColumnId, active)
          assert.deepStrictEqual(projected.participantIds, [])
          assert.deepStrictEqual(projected.labelIds, [])
          assert.deepStrictEqual(projected.checklist, [])
          assert.deepStrictEqual(projected.attachmentIds, [])
        }

        yield* execute(
          projectId,
          request({
            _tag: "ticket.reopen",
            commandId: command(42),
            payload: { ticketId: firstTicket },
          }),
        )
        yield* execute(
          projectId,
          request({
            _tag: "ticket.update",
            commandId: command(43),
            payload: {
              ticketId: firstTicket,
              description: null,
              dueAt: null,
            },
          }),
        )
        yield* execute(
          projectId,
          request({
            _tag: "ticket.assign",
            commandId: command(44),
            payload: { ticketId: firstTicket },
          }),
        )
        yield* execute(
          projectId,
          request({
            _tag: "ticket.archive",
            commandId: command(45),
            payload: { ticketId: firstTicket },
          }),
        )
        snapshot = yield* readProjectBoardSnapshot(projectId)
        const archived = snapshot.tickets.find((entry) => entry.id === firstTicket)
        assert.isDefined(archived)
        assert.isDefined(archived?.archivedAt)

        yield* execute(
          projectId,
          request({
            _tag: "ticket.restore",
            commandId: command(46),
            payload: { ticketId: firstTicket },
          }),
        )
        snapshot = yield* readProjectBoardSnapshot(projectId)
        const restored = snapshot.tickets.find((entry) => entry.id === firstTicket)
        assert.isDefined(restored)
        if (restored !== undefined) {
          assert.isUndefined(restored.description)
          assert.isUndefined(restored.dueAt)
          assert.isUndefined(restored.assigneeId)
          assert.strictEqual(restored.columnId, active)
        }

        const sql = yield* SqlClient
        const executions = yield* sql<{
          expected_outcome: string
          max_tokens: number
          timeout_seconds: number
          tool_policy: { allowed: Array<string> }
        }>`
          SELECT expected_outcome, max_tokens, timeout_seconds, tool_policy
          FROM executions
          WHERE project_id = ${projectId} AND id = ${execution(30)}
        `
        assert.deepStrictEqual(executions, [
          {
            expected_outcome: "Une migration durable",
            max_tokens: 20_000,
            timeout_seconds: 1_800,
            tool_policy: { allowed: ["read", "edit"] },
          },
        ])
      }),
    )

    it.effect(
      "projette création, mise à jour, ordre et suppression de colonnes avec retarget",
      () =>
        Effect.gen(function* () {
          const projectId = project(7)
          const backlog = column(41)
          const active = column(42)
          const done = column(43)
          const temporary = column(44)
          const completedTicket = ticket(40)
          const archivedTicket = ticket(41)
          const activeTicket = ticket(42)
          yield* initialize(projectId, command(50), backlog, active, done)

          yield* execute(
            projectId,
            request({
              _tag: "kanbanColumn.create",
              commandId: command(51),
              payload: {
                columnId: temporary,
                name: "Revue",
                color: "#112233",
                beforeColumnId: done,
              },
            }),
          )
          yield* execute(
            projectId,
            request({
              _tag: "kanbanColumn.update",
              commandId: command(52),
              payload: { columnId: temporary, name: "Validation", color: "#445566" },
            }),
          )
          yield* execute(
            projectId,
            request({
              _tag: "kanbanColumn.move",
              commandId: command(53),
              payload: { columnId: temporary, afterColumnId: backlog },
            }),
          )

          yield* execute(
            projectId,
            createTicket(command(54), completedTicket, thread(40), temporary, "Terminé"),
          )
          yield* execute(
            projectId,
            request({
              _tag: "ticket.complete",
              commandId: command(55),
              payload: { ticketId: completedTicket },
            }),
          )
          yield* execute(
            projectId,
            createTicket(command(56), archivedTicket, thread(41), temporary, "Archivé"),
          )
          yield* execute(
            projectId,
            request({
              _tag: "ticket.archive",
              commandId: command(57),
              payload: { ticketId: archivedTicket },
            }),
          )
          yield* execute(
            projectId,
            createTicket(command(58), activeTicket, thread(42), temporary, "Actif"),
          )

          const deleted = yield* execute(
            projectId,
            request({
              _tag: "kanbanColumn.delete",
              commandId: command(59),
              payload: { columnId: temporary, destinationColumnId: backlog },
            }),
          )
          assert.strictEqual(deleted.response._tag, "accepted")
          if (deleted.response._tag === "accepted") {
            assert.strictEqual(deleted.response.eventIds.length, 2)
          }

          const snapshot = yield* readProjectBoardSnapshot(projectId)
          assert.isFalse(snapshot.columns.some((entry) => entry.id === temporary))
          assert.strictEqual(
            snapshot.tickets.find((entry) => entry.id === activeTicket)?.columnId,
            backlog,
          )
          assert.strictEqual(
            snapshot.tickets.find((entry) => entry.id === completedTicket)?.lastActiveColumnId,
            backlog,
          )

          const sql = yield* SqlClient
          const archivedRows = yield* sql<{ column_id: string }>`
          SELECT column_id
          FROM tickets
          WHERE project_id = ${projectId} AND id = ${archivedTicket}
        `
          assert.strictEqual(archivedRows[0]?.column_id, backlog)

          const journal = yield* sql<{
            aggregate_type: string
            aggregate_id: string
            aggregate_version: string
            project_position: string
          }>`
          SELECT aggregate_type, aggregate_id, aggregate_version::text, project_position::text
          FROM events
          WHERE project_id = ${projectId}
          ORDER BY events.aggregate_version
        `
          assert.isTrue(
            journal.every(
              (entry) => entry.aggregate_type === "board" && entry.aggregate_id === projectId,
            ),
          )
          assert.deepStrictEqual(
            journal.map((entry) => entry.aggregate_version),
            journal.map((_, index) => String(index + 1)),
          )
          assert.deepStrictEqual(
            journal.map((entry) => entry.project_position),
            journal.map((_, index) => String(index + 1)),
          )
        }),
    )

    it.effect("isole les snapshots de deux projets partageant les mêmes identifiants", () =>
      Effect.gen(function* () {
        const firstProject = project(8)
        const secondProject = project(9)
        const backlog = column(51)
        const active = column(52)
        const done = column(53)
        const sharedTicket = ticket(50)
        yield* initialize(firstProject, command(60), backlog, active, done)
        yield* initialize(secondProject, command(61), backlog, active, done)
        yield* execute(
          firstProject,
          createTicket(command(62), sharedTicket, thread(50), backlog, "Premier"),
        )
        yield* execute(
          secondProject,
          createTicket(command(63), sharedTicket, thread(50), backlog, "Second"),
        )

        const first = yield* readProjectBoardSnapshot(firstProject)
        const second = yield* readProjectBoardSnapshot(secondProject)
        assert.deepStrictEqual(
          first.tickets.map((entry) => entry.title),
          ["Premier"],
        )
        assert.deepStrictEqual(
          second.tickets.map((entry) => entry.title),
          ["Second"],
        )
        assert.strictEqual(first.cursor, `v1.${firstProject}.4`)
        assert.strictEqual(second.cursor, `v1.${secondProject}.4`)
      }),
    )
  })
})
