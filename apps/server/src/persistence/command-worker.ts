import { CommandIdConflict } from "@noyau/contracts/errors"
import type {
  ActorId,
  CommandId,
  CorrelationId,
  ProjectId,
  SchemaVersion,
} from "@noyau/contracts/ids"
import type { Scope } from "effect"
import { Crypto, DateTime, Deferred, Effect, PubSub, Queue, Result, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import type { SqlError } from "effect/unstable/sql/SqlError"

import type { DrainableWorker } from "./drainable-worker.ts"

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

export interface DurableReceipt<Rejection> {
  readonly commandId: string
  readonly response:
    | { readonly _tag: "accepted"; readonly sequence: number }
    | { readonly _tag: "rejected"; readonly error: Rejection }
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
  readonly subscribeEvents: Effect.Effect<
    PubSub.Subscription<PersistedEvent<Event>>,
    never,
    Scope.Scope
  >
}

export interface CommandWorkerOptions<
  Command,
  Event,
  Rejection,
  State,
  ProjectionError,
  ProjectionRequirements,
> {
  readonly commandSchema: Schema.Codec<Command, unknown>
  readonly eventSchema: Schema.Codec<Event, unknown>
  readonly rejectionSchema: Schema.Codec<Rejection, unknown>
  readonly metadata: (command: Command) => DurableCommand
  readonly aggregate: (command: Command) => AggregateRef
  readonly initialState: (aggregate: AggregateRef) => State
  readonly recoverStateAfterReplay?: (state: State, aggregate: AggregateRef) => State
  readonly decide: (
    state: State,
    command: Command,
  ) => Result.Result<ReadonlyArray<Event>, Rejection>
  readonly evolve: (state: State, event: Event) => State
  /**
   * Enforce cross-aggregate persistence invariants inside the command
   * transaction. A rejection is persisted as the command receipt.
   */
  readonly validate?: (
    command: Command,
  ) => Effect.Effect<Rejection | null, ProjectionError, SqlClient | ProjectionRequirements>
  readonly project: (
    event: PersistedEvent<Event>,
  ) => Effect.Effect<void, ProjectionError, SqlClient | ProjectionRequirements>
  readonly reactor: DrainableWorker<PersistedEvent<Event>>
}

interface CommandEnvelope<Command, Rejection, Error> {
  readonly command: Command
  readonly result: Deferred.Deferred<DurableReceipt<Rejection>, Error>
}

const ReceiptRow = Schema.Struct({
  aggregate_kind: Schema.String,
  aggregate_id: Schema.String,
  command: Schema.String,
  response: Schema.String,
})

const EventRow = Schema.Struct({
  event_id: Schema.String,
  sequence: Schema.Int,
  project_id: Schema.String,
  actor_id: Schema.String,
  correlation_id: Schema.String,
  causation_id: Schema.String,
  occurred_at: Schema.String,
  schema_version: Schema.Int,
  aggregate_kind: Schema.String,
  aggregate_id: Schema.String,
  aggregate_version: Schema.Int,
  event: Schema.String,
})

const VersionRow = Schema.Struct({ version: Schema.Int })
const SequenceRow = Schema.Struct({ sequence: Schema.Int })

const decodeReceiptRow = Schema.decodeEffect(ReceiptRow)
const decodeEventRow = Schema.decodeEffect(EventRow)
const decodeVersionRow = Schema.decodeEffect(VersionRow)
const decodeSequenceRow = Schema.decodeEffect(SequenceRow)
const decodeOccurredAt = Schema.decodeEffect(Schema.DateTimeUtcFromString)

const aggregateKey = ({ kind, id }: AggregateRef) => `${kind}\u0000${id}`

export const makeCommandWorker = <
  Command,
  Event,
  Rejection,
  State,
  ProjectionError,
  ProjectionRequirements,
>(
  options: CommandWorkerOptions<
    Command,
    Event,
    Rejection,
    State,
    ProjectionError,
    ProjectionRequirements
  >,
): Effect.Effect<
  CommandWorker<Command, Event, State, Rejection, CommandIdConflict | ProjectionError | SqlError>,
  never,
  Scope.Scope | SqlClient | Crypto.Crypto | ProjectionRequirements
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const states = new Map<string, State>()
    const eventPubSub = yield* PubSub.unbounded<PersistedEvent<Event>>()

    const encodeCommand = Schema.encodeEffect(Schema.fromJsonString(options.commandSchema))
    const encodeEvent = Schema.encodeEffect(Schema.fromJsonString(options.eventSchema))
    const decodeEvent = Schema.decodeEffect(Schema.fromJsonString(options.eventSchema))
    const responseSchema = Schema.Union([
      Schema.TaggedStruct("accepted", { sequence: Schema.Int }),
      Schema.TaggedStruct("rejected", { error: options.rejectionSchema }),
    ])
    const responseJson = Schema.fromJsonString(responseSchema)
    const encodeResponse = Schema.encodeEffect(responseJson)
    const decodeResponse = Schema.decodeEffect(responseJson)

    const rowToEvent = Effect.fn("CommandWorker.rowToEvent")(function* (
      input: (typeof EventRow)["Encoded"],
    ) {
      const row = yield* decodeEventRow(input)
      return {
        eventId: row.event_id,
        sequence: row.sequence,
        projectId: row.project_id,
        actorId: row.actor_id,
        correlationId: row.correlation_id,
        causationId: row.causation_id,
        occurredAt: yield* decodeOccurredAt(row.occurred_at),
        schemaVersion: row.schema_version,
        aggregate: {
          kind: row.aggregate_kind,
          id: row.aggregate_id,
        },
        aggregateVersion: row.aggregate_version,
        event: yield* decodeEvent(row.event),
      } satisfies PersistedEvent<Event>
    }, Effect.orDie)

    const loadState = Effect.fn("CommandWorker.loadState")(function* (aggregate: AggregateRef) {
      const cached = states.get(aggregateKey(aggregate))
      if (cached !== undefined) {
        return cached
      }
      const rows = yield* sql<(typeof EventRow)["Encoded"]>`
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
      state = options.recoverStateAfterReplay?.(state, aggregate) ?? state
      states.set(aggregateKey(aggregate), state)
      return state
    })

    const persistReceipt = (
      metadata: DurableCommand,
      aggregate: AggregateRef,
      encodedCommand: string,
      response: DurableReceipt<Rejection>["response"],
    ) =>
      Effect.gen(function* () {
        const encodedResponse = yield* encodeResponse(response).pipe(Effect.orDie)
        yield* sql`
          INSERT INTO receipts (
            command_id, aggregate_kind, aggregate_id, command, response, created_at
          ) VALUES (
            ${metadata.commandId}, ${aggregate.kind}, ${aggregate.id}, ${encodedCommand},
            ${encodedResponse}, ${DateTime.formatIso(metadata.issuedAt)}
          )
        `
      })

    type WorkerError = CommandIdConflict | ProjectionError | SqlError
    type Committed = {
      readonly state: State
      readonly events: ReadonlyArray<PersistedEvent<Event>>
    }
    type TransactionResult = {
      readonly receipt: DurableReceipt<Rejection>
      readonly committed: Committed | null
    }

    const execute = Effect.fn("CommandWorker.execute")(function* (
      command: Command,
    ): Effect.fn.Return<DurableReceipt<Rejection>, WorkerError, ProjectionRequirements> {
      const metadata = options.metadata(command)
      const aggregate = options.aggregate(command)
      const encodedCommand = yield* encodeCommand(command).pipe(Effect.orDie)

      const transaction: TransactionResult = yield* sql.withTransaction(
        Effect.gen(function* () {
          const receiptRows = yield* sql<(typeof ReceiptRow)["Encoded"]>`
            SELECT aggregate_kind, aggregate_id, command, response
            FROM receipts
            WHERE command_id = ${metadata.commandId}
          `
          const existing = receiptRows[0]
          if (existing !== undefined) {
            const receipt = yield* decodeReceiptRow(existing).pipe(Effect.orDie)
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
              committed: null,
            }
          }

          const validation =
            options.validate === undefined
              ? null
              : yield* options.validate(command).pipe(Effect.provideService(SqlClient, sql))
          if (validation !== null) {
            const response = { _tag: "rejected" as const, error: validation }
            yield* persistReceipt(metadata, aggregate, encodedCommand, response)
            return {
              receipt: { commandId: metadata.commandId, response },
              committed: null,
            }
          }

          const state = yield* loadState(aggregate)
          const decision = options.decide(state, command)
          if (Result.isFailure(decision)) {
            const response = { _tag: "rejected" as const, error: decision.failure }
            yield* persistReceipt(metadata, aggregate, encodedCommand, response)
            return {
              receipt: { commandId: metadata.commandId, response },
              committed: null,
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
          const versionRows = yield* sql<(typeof VersionRow)["Encoded"]>`
            SELECT version
            FROM aggregate_heads
            WHERE aggregate_kind = ${aggregate.kind}
              AND aggregate_id = ${aggregate.id}
          `
          const versionRow = versionRows[0]
          if (versionRow === undefined) {
            return yield* Effect.die("Aggregate head is missing")
          }
          const currentVersion = (yield* decodeVersionRow(versionRow).pipe(Effect.orDie)).version

          let nextState = state
          const committedEvents: Array<PersistedEvent<Event>> = []
          for (const [index, event] of decision.success.entries()) {
            const eventId = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
            const aggregateVersion = currentVersion + index + 1
            const encodedEvent = yield* encodeEvent(event).pipe(Effect.orDie)
            const insertedRows = yield* sql<(typeof SequenceRow)["Encoded"]>`
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
            const insertedRow = insertedRows[0]
            if (insertedRow === undefined) {
              return yield* Effect.die("Inserted event sequence is missing")
            }
            const sequence = (yield* decodeSequenceRow(insertedRow).pipe(Effect.orDie)).sequence
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
            } satisfies PersistedEvent<Event>
            yield* options.project(persistedEvent).pipe(Effect.provideService(SqlClient, sql))
            nextState = options.evolve(nextState, event)
            committedEvents.push(persistedEvent)
          }

          yield* sql`
            UPDATE aggregate_heads
            SET version = ${currentVersion + committedEvents.length}
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
            committed: { state: nextState, events: committedEvents },
          }
        }),
      )

      if (transaction.committed !== null) {
        states.set(aggregateKey(aggregate), transaction.committed.state)
        for (const event of transaction.committed.events) {
          yield* PubSub.publish(eventPubSub, event)
        }
        for (const event of transaction.committed.events) {
          yield* options.reactor.enqueue(event)
        }
      }
      return transaction.receipt
    })

    const commandQueue = yield* Queue.unbounded<CommandEnvelope<Command, Rejection, WorkerError>>()
    const processEnvelope = (envelope: CommandEnvelope<Command, Rejection, WorkerError>) =>
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
      const rows = yield* sql<(typeof EventRow)["Encoded"]>`
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
      const rows = yield* sql<
        (typeof SequenceRow)["Encoded"]
      >`SELECT COALESCE(MAX(sequence), 0) AS sequence FROM events`
      const row = rows[0]
      if (row === undefined) {
        return yield* Effect.die("Latest event sequence is missing")
      }
      return (yield* decodeSequenceRow(row).pipe(Effect.orDie)).sequence
    })

    const dispatch = (command: Command) =>
      Effect.gen(function* () {
        const result = yield* Deferred.make<DurableReceipt<Rejection>, WorkerError>()
        yield* Queue.offer(commandQueue, { command, result })
        return yield* Deferred.await(result)
      })

    return {
      dispatch,
      readModel: loadState,
      readEvents,
      latestSequence,
      drainReactors: options.reactor.drain,
      subscribeEvents: PubSub.subscribe(eventPubSub),
    }
  })
