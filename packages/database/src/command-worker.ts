import { CommandIdConflict } from "@noyau/protocol/errors"
import type {
  ActorId,
  CommandId,
  CorrelationId,
  ProjectId,
  SchemaVersion,
} from "@noyau/protocol/ids"
import {
  Crypto,
  DateTime,
  Deferred,
  Effect,
  Option,
  PubSub,
  Queue,
  Result,
  Schema,
  Scope,
  Stream,
} from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import type { SqlError } from "effect/unstable/sql/SqlError"

import type { DrainableWorker } from "./drainable-worker"

export interface AggregateRef {
  readonly kind: string
  readonly id: string
}

export interface DurableCommand {
  readonly commandId: CommandId
  readonly projectId: ProjectId
  readonly actorId: ActorId
  readonly correlationId: CorrelationId
  readonly issuedAt: DateTime.Utc
  readonly schemaVersion: SchemaVersion
}

export interface PersistedEvent<Event> {
  readonly eventId: string
  readonly sequence: number
  readonly projectId: string
  readonly actorId: string
  readonly correlationId: string
  readonly causationId: string
  readonly occurredAt: DateTime.Utc
  readonly schemaVersion: number
  readonly aggregate: AggregateRef
  readonly aggregateVersion: number
  readonly event: Event
}

export type DurableReceipt<Rejection> = {
  readonly commandId: string
  readonly response:
    | {
        readonly _tag: "accepted"
        readonly sequence: number
      }
    | {
        readonly _tag: "rejected"
        readonly error: Rejection
      }
}

interface CommandEnvelope<Command, Rejection, Error> {
  readonly command: Command
  readonly result: Deferred.Deferred<DurableReceipt<Rejection>, Error>
}

interface Committed<State, Event> {
  readonly state: State
  readonly events: ReadonlyArray<PersistedEvent<Event>>
}

export interface CommandWorker<Command, Event, State, Rejection, Error> {
  readonly dispatch: (command: Command) => Effect.Effect<DurableReceipt<Rejection>, Error>
  readonly readModel: (aggregate: AggregateRef) => Effect.Effect<State, SqlError>
  readonly readEvents: (
    afterSequence: number,
    limit?: number,
  ) => Effect.Effect<ReadonlyArray<PersistedEvent<Event>>, SqlError>
  readonly latestSequence: Effect.Effect<number, SqlError>
  readonly drainReactors: Effect.Effect<void>
  readonly streamEvents: Stream.Stream<PersistedEvent<Event>>
}

export interface CommandWorkerOptions<
  CommandSchema extends Schema.Top,
  EventSchema extends Schema.Top,
  RejectionSchema extends Schema.Top,
  State,
  ProjectionError,
  ProjectionRequirements,
> {
  readonly commandSchema: CommandSchema
  readonly eventSchema: EventSchema
  readonly rejectionSchema: RejectionSchema
  readonly metadata: (command: CommandSchema["Type"]) => DurableCommand
  readonly aggregate: (command: CommandSchema["Type"]) => AggregateRef
  readonly initialState: (aggregate: AggregateRef) => State
  readonly decide: (
    state: State,
    command: CommandSchema["Type"],
  ) => Result.Result<ReadonlyArray<EventSchema["Type"]>, RejectionSchema["Type"]>
  readonly evolve: (state: State, event: EventSchema["Type"]) => State
  readonly project: (
    event: PersistedEvent<EventSchema["Type"]>,
  ) => Effect.Effect<void, ProjectionError, SqlClient | ProjectionRequirements>
  readonly reactor: DrainableWorker<PersistedEvent<EventSchema["Type"]>>
}

const ReceiptRow = Schema.Struct({
  aggregate_kind: Schema.String,
  aggregate_id: Schema.String,
  command: Schema.String,
  response: Schema.String,
})

const EventRow = Schema.Struct({
  event_id: Schema.String,
  sequence: Schema.Number,
  project_id: Schema.String,
  actor_id: Schema.String,
  correlation_id: Schema.String,
  causation_id: Schema.String,
  occurred_at: Schema.String,
  schema_version: Schema.Number,
  aggregate_kind: Schema.String,
  aggregate_id: Schema.String,
  aggregate_version: Schema.Number,
  event: Schema.String,
})

const VersionRow = Schema.Struct({ version: Schema.Number })
const SequenceRow = Schema.Struct({ sequence: Schema.Number })

const decodeReceiptRow = Schema.decodeUnknownEffect(ReceiptRow)
const decodeEventRow = Schema.decodeUnknownEffect(EventRow)
const decodeVersionRow = Schema.decodeUnknownEffect(VersionRow)
const decodeSequenceRow = Schema.decodeUnknownEffect(SequenceRow)

const aggregateKey = ({ kind, id }: AggregateRef) => `${kind}\u0000${id}`

export const makeCommandWorker = <
  CommandSchema extends Schema.Top,
  EventSchema extends Schema.Top,
  RejectionSchema extends Schema.Top,
  State,
  ProjectionError,
  ProjectionRequirements,
>(
  options: CommandWorkerOptions<
    CommandSchema,
    EventSchema,
    RejectionSchema,
    State,
    ProjectionError,
    ProjectionRequirements
  >,
): Effect.Effect<
  CommandWorker<
    CommandSchema["Type"],
    EventSchema["Type"],
    State,
    RejectionSchema["Type"],
    CommandIdConflict | ProjectionError | SqlError
  >,
  never,
  Scope.Scope | SqlClient | Crypto.Crypto | ProjectionRequirements
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const states = new Map<string, State>()
    const eventPubSub = yield* PubSub.unbounded<PersistedEvent<EventSchema["Type"]>>()

    const commandJson = Schema.fromJsonString(options.commandSchema)
    const eventJson = Schema.fromJsonString(options.eventSchema)
    const responseSchema = Schema.Union([
      Schema.TaggedStruct("accepted", { sequence: Schema.Number }),
      Schema.TaggedStruct("rejected", { error: options.rejectionSchema }),
    ])
    const responseJson = Schema.fromJsonString(responseSchema)
    const encodeCommand = Schema.encodeEffect(commandJson)
    const encodeEvent = Schema.encodeEffect(eventJson)
    const decodeEvent = Schema.decodeUnknownEffect(eventJson)
    const encodeResponse = Schema.encodeEffect(responseJson)
    const decodeResponse = Schema.decodeUnknownEffect(responseJson)

    const rowToEvent = Effect.fn("CommandWorker.rowToEvent")(function* (input: unknown) {
      const row = yield* decodeEventRow(input).pipe(Effect.orDie)
      return {
        eventId: row.event_id,
        sequence: row.sequence,
        projectId: row.project_id,
        actorId: row.actor_id,
        correlationId: row.correlation_id,
        causationId: row.causation_id,
        occurredAt: yield* Schema.decodeUnknownEffect(Schema.DateTimeUtcFromString)(
          row.occurred_at,
        ).pipe(Effect.orDie),
        schemaVersion: row.schema_version,
        aggregate: {
          kind: row.aggregate_kind,
          id: row.aggregate_id,
        },
        aggregateVersion: row.aggregate_version,
        event: yield* decodeEvent(row.event).pipe(Effect.orDie),
      } satisfies PersistedEvent<EventSchema["Type"]>
    })

    const loadState = Effect.fn("CommandWorker.loadState")(function* (aggregate: AggregateRef) {
      const cached = states.get(aggregateKey(aggregate))
      if (cached !== undefined) {
        return cached
      }
      const rows = yield* sql`
        SELECT
          event_id, sequence, project_id, actor_id, correlation_id, causation_id,
          occurred_at, schema_version, aggregate_kind, aggregate_id,
          aggregate_version, event
        FROM events
        WHERE aggregate_kind = ${aggregate.kind}
          AND aggregate_id = ${aggregate.id}
        ORDER BY aggregate_version
      `
      let state = options.initialState(aggregate)
      for (const row of rows) {
        state = options.evolve(state, (yield* rowToEvent(row)).event)
      }
      states.set(aggregateKey(aggregate), state)
      return state
    })

    const persistReceipt = (
      command: DurableCommand,
      aggregate: AggregateRef,
      encodedCommand: string,
      response: DurableReceipt<RejectionSchema["Type"]>["response"],
    ) =>
      Effect.gen(function* () {
        const encodedResponse = yield* encodeResponse(response).pipe(Effect.orDie)
        yield* sql`
          INSERT INTO receipts (
            command_id, aggregate_kind, aggregate_id, command, response, created_at
          ) VALUES (
            ${command.commandId}, ${aggregate.kind}, ${aggregate.id}, ${encodedCommand},
            ${encodedResponse}, ${DateTime.formatIso(command.issuedAt)}
          )
        `
      })

    const execute = Effect.fn("CommandWorker.execute")(function* (
      command: CommandSchema["Type"],
    ) {
      const metadata = options.metadata(command)
      const aggregate = options.aggregate(command)
      const encodedCommand = yield* encodeCommand(command).pipe(Effect.orDie)

      const transaction = yield* sql.withTransaction(
        Effect.gen(function* () {
          const receiptRows = yield* sql`
            SELECT aggregate_kind, aggregate_id, command, response
            FROM receipts
            WHERE command_id = ${metadata.commandId}
          `
          const existingRow = Option.fromNullable(receiptRows[0])
          if (Option.isSome(existingRow)) {
            const receipt = yield* decodeReceiptRow(existingRow.value).pipe(Effect.orDie)
            if (
              receipt.aggregate_kind !== aggregate.kind ||
              receipt.aggregate_id !== aggregate.id ||
              receipt.command !== encodedCommand
            ) {
              return yield* new CommandIdConflict({ commandId: metadata.commandId })
            }
            return {
              receipt: {
                commandId: metadata.commandId,
                response: yield* decodeResponse(receipt.response).pipe(Effect.orDie),
              },
              committed: Option.none<Committed<State, EventSchema["Type"]>>(),
            }
          }

          const state = yield* loadState(aggregate)
          const decision = options.decide(state, command)
          if (Result.isFailure(decision)) {
            const response = {
              _tag: "rejected" as const,
              error: decision.failure,
            }
            yield* persistReceipt(metadata, aggregate, encodedCommand, response)
            return {
              receipt: { commandId: metadata.commandId, response },
              committed: Option.none<Committed<State, EventSchema["Type"]>>(),
            }
          }
          if (decision.success.length === 0) {
            return yield* Effect.die("A durable command must produce at least one event")
          }

          yield* sql`
            INSERT INTO aggregate_heads (aggregate_kind, aggregate_id, version)
            VALUES (${aggregate.kind}, ${aggregate.id}, 0)
            ON CONFLICT (aggregate_kind, aggregate_id) DO NOTHING
          `
          const versionRows = yield* sql`
            SELECT version
            FROM aggregate_heads
            WHERE aggregate_kind = ${aggregate.kind}
              AND aggregate_id = ${aggregate.id}
          `
          const currentVersion = (yield* decodeVersionRow(versionRows[0]).pipe(Effect.orDie)).version

          let nextState = state
          const committedEvents: Array<PersistedEvent<EventSchema["Type"]>> = []
          for (const [index, event] of decision.success.entries()) {
            const eventId = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
            const aggregateVersion = currentVersion + index + 1
            const encodedEvent = yield* encodeEvent(event).pipe(Effect.orDie)
            const insertedRows = yield* sql`
              INSERT INTO events (
                event_id, project_id, actor_id, correlation_id, causation_id,
                occurred_at, schema_version, aggregate_kind, aggregate_id,
                aggregate_version, event
              ) VALUES (
                ${eventId}, ${metadata.projectId}, ${metadata.actorId}, ${metadata.correlationId},
                ${metadata.commandId}, ${DateTime.formatIso(metadata.issuedAt)},
                ${metadata.schemaVersion}, ${aggregate.kind}, ${aggregate.id},
                ${aggregateVersion}, ${encodedEvent}
              )
              RETURNING sequence
            `
            const sequence = (yield* decodeSequenceRow(insertedRows[0]).pipe(Effect.orDie)).sequence
            const persistedEvent = {
              eventId,
              sequence,
              projectId: metadata.projectId,
              actorId: metadata.actorId,
              correlationId: metadata.correlationId,
              causationId: metadata.commandId,
              occurredAt: metadata.issuedAt,
              schemaVersion: metadata.schemaVersion,
              aggregate,
              aggregateVersion,
              event,
            } satisfies PersistedEvent<EventSchema["Type"]>
            yield* options.project(persistedEvent)
            nextState = options.evolve(nextState, event)
            committedEvents.push(persistedEvent)
          }

          const nextVersion = currentVersion + committedEvents.length
          yield* sql`
            UPDATE aggregate_heads
            SET version = ${nextVersion}
            WHERE aggregate_kind = ${aggregate.kind}
              AND aggregate_id = ${aggregate.id}
          `
          const lastSequence = committedEvents.at(-1)?.sequence
          if (lastSequence === undefined) {
            return yield* Effect.die("Committed event sequence is missing")
          }
          const response = { _tag: "accepted" as const, sequence: lastSequence }
          yield* persistReceipt(metadata, aggregate, encodedCommand, response)
          return {
            receipt: { commandId: metadata.commandId, response },
            committed: Option.some({
              state: nextState,
              events: committedEvents,
            }),
          }
        }),
      )

      if (Option.isSome(transaction.committed)) {
        states.set(aggregateKey(aggregate), transaction.committed.value.state)
        for (const event of transaction.committed.value.events) {
          yield* PubSub.publish(eventPubSub, event)
        }
        for (const event of transaction.committed.value.events) {
          yield* options.reactor.enqueue(event)
        }
      }
      return transaction.receipt
    })

    type WorkerError = CommandIdConflict | ProjectionError | SqlError
    const commandQueue =
      yield* Queue.unbounded<CommandEnvelope<CommandSchema["Type"], RejectionSchema["Type"], WorkerError>>()

    const processEnvelope = (envelope: CommandEnvelope<CommandSchema["Type"], RejectionSchema["Type"], WorkerError>) =>
      Effect.exit(execute(envelope.command)).pipe(
        Effect.flatMap((exit) => Deferred.done(envelope.result, exit)),
        Effect.asVoid,
      )

    yield* Queue.take(commandQueue).pipe(
      Effect.flatMap(processEnvelope),
      Effect.forever,
      Effect.forkScoped,
    )

    const readEvents = Effect.fn("CommandWorker.readEvents")(function* (
      afterSequence: number,
      limit = 100,
    ) {
      const boundedLimit = Math.max(1, Math.min(limit, 1_000))
      const rows = yield* sql`
        SELECT
          event_id, sequence, project_id, actor_id, correlation_id, causation_id,
          occurred_at, schema_version, aggregate_kind, aggregate_id,
          aggregate_version, event
        FROM events
        WHERE sequence > ${afterSequence}
        ORDER BY sequence
        LIMIT ${boundedLimit}
      `
      return yield* Effect.forEach(rows, rowToEvent)
    })

    const latestSequence = Effect.gen(function* () {
      const rows = yield* sql`SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events`
      return (yield* decodeSequenceRow(rows[0]).pipe(Effect.orDie)).sequence
    })

    const dispatch = (command: CommandSchema["Type"]) =>
      Effect.gen(function* () {
        const result = yield* Deferred.make<DurableReceipt<RejectionSchema["Type"]>, WorkerError>()
        yield* Queue.offer(commandQueue, { command, result })
        return yield* Deferred.await(result)
      })

    return {
      dispatch,
      readModel: loadState,
      readEvents,
      latestSequence,
      drainReactors: options.reactor.drain,
      get streamEvents() {
        return Stream.fromPubSub(eventPubSub)
      },
    }
  })
