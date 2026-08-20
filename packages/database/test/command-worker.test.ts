import { assert, describe, layer } from "@effect/vitest"
import { makeCommandWorker } from "@noyau/database/command-worker"
import {
  type DrainableWorker,
  makeDrainableWorker,
} from "@noyau/database/drainable-worker"
import { memoryLayer } from "@noyau/database/sqlite"
import { CommandIdConflict } from "@noyau/protocol/errors"
import {
  ActorId,
  CommandId,
  CorrelationId,
  ProjectId,
  SchemaVersion,
} from "@noyau/protocol/ids"
import { Effect, Option, Result, Schema, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const CounterCommand = Schema.Struct({
  _tag: Schema.Literal("counter.change"),
  commandId: CommandId,
  projectId: ProjectId,
  actorId: ActorId,
  correlationId: CorrelationId,
  issuedAt: Schema.DateTimeUtcFromString,
  schemaVersion: SchemaVersion,
  aggregateId: Schema.String,
  amount: Schema.Int,
  reject: Schema.optionalKey(Schema.Boolean),
})
type CounterCommand = (typeof CounterCommand)["Type"]

const CounterEvent = Schema.TaggedStruct("counter.changed", {
  amount: Schema.Int,
})
type CounterEvent = (typeof CounterEvent)["Type"]

const CounterRejected = Schema.TaggedStruct("CounterRejected", {
  reason: Schema.String,
})

class ProjectionFailure extends Schema.TaggedError<ProjectionFailure>()("ProjectionFailure", {}) {}

const decodeCommand = Schema.decodeUnknownSync(CounterCommand)
const command = (
  commandId: string,
  aggregateId: string,
  amount: number,
  reject = false,
): CounterCommand =>
  decodeCommand({
    _tag: "counter.change",
    commandId,
    projectId: "aaaaaaaa-0000-4000-8000-000000000001",
    actorId: "human:test",
    correlationId: commandId,
    issuedAt: "2026-08-20T00:00:00.000Z",
    schemaVersion: 1,
    aggregateId,
    amount,
    ...(reject ? { reject } : {}),
  })

const makeOptions = (
  reactor: DrainableWorker<{
    readonly sequence: number
    readonly event: CounterEvent
  }>,
  decisions: { count: number },
) => ({
  commandSchema: CounterCommand,
  eventSchema: CounterEvent,
  rejectionSchema: CounterRejected,
  metadata: (input: CounterCommand) => input,
  aggregate: (input: CounterCommand) => ({ kind: "counter", id: input.aggregateId }),
  initialState: () => 0,
  decide: (state: number, input: CounterCommand) => {
    decisions.count = decisions.count + 1
    return input.reject
      ? Result.fail(CounterRejected.make({ reason: `rejected at ${state}` }))
      : Result.succeed([CounterEvent.make({ amount: input.amount })])
  },
  evolve: (state: number, event: CounterEvent) => state + event.amount,
  project: (event: { readonly aggregate: { readonly id: string }; readonly event: CounterEvent }) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient
      yield* sql`
        INSERT INTO counter_projection (aggregate_id, value)
        VALUES (${event.aggregate.id}, ${event.event.amount})
        ON CONFLICT (aggregate_id) DO UPDATE
          SET value = value + excluded.value
      `
      if (event.event.amount === 13) {
        return yield* new ProjectionFailure()
      }
    }),
  reactor,
})

const projectionValue = (aggregateId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const rows = yield* sql<{ value: number }>`
      SELECT value FROM counter_projection WHERE aggregate_id = ${aggregateId}
    `
    return rows[0]?.value
  })

describe("durable command worker", () => {
  layer(memoryLayer)((it) => {
    it.effect("stabilise les retries et refuse la réutilisation d'un commandId", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient
          yield* sql`
            CREATE TABLE counter_projection (
              aggregate_id TEXT PRIMARY KEY,
              value INTEGER NOT NULL
            )
          `
          const reacted: Array<number> = []
          const reactor = yield* makeDrainableWorker((event: { readonly sequence: number }) =>
            Effect.sync(() => {
              reacted.push(event.sequence)
            }),
          )
          const decisions = { count: 0 }
          const worker = yield* makeCommandWorker(makeOptions(reactor, decisions))

          const accepted = command("bbbbbbbb-0000-4000-8000-000000000001", "one", 2)
          const first = yield* worker.dispatch(accepted)
          const retried = yield* worker.dispatch(accepted)
          assert.deepStrictEqual(retried, first)
          assert.strictEqual(decisions.count, 1)
          assert.strictEqual(yield* projectionValue("one"), 2)

          const rejected = command("bbbbbbbb-0000-4000-8000-000000000002", "one", 5, true)
          const firstRejection = yield* worker.dispatch(rejected)
          const retriedRejection = yield* worker.dispatch(rejected)
          assert.deepStrictEqual(retriedRejection, firstRejection)
          assert.strictEqual(firstRejection.response._tag, "rejected")
          assert.strictEqual(decisions.count, 2)

          const aggregateConflict = yield* Effect.flip(
            worker.dispatch(
              command("bbbbbbbb-0000-4000-8000-000000000001", "another", 2),
            ),
          )
          const payloadConflict = yield* Effect.flip(
            worker.dispatch(command("bbbbbbbb-0000-4000-8000-000000000001", "one", 3)),
          )
          assert.isTrue(aggregateConflict instanceof CommandIdConflict)
          assert.isTrue(payloadConflict instanceof CommandIdConflict)

          yield* worker.drainReactors
          assert.deepStrictEqual(reacted, [1])
          assert.strictEqual((yield* worker.readEvents(0)).length, 1)
          assert.strictEqual(yield* worker.latestSequence, 1)
        }),
      ),
    )

    it.effect("sérialise les commandes et ne publie qu'après commit", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient
          yield* sql`
            CREATE TABLE counter_projection (
              aggregate_id TEXT PRIMARY KEY,
              value INTEGER NOT NULL
            )
          `
          const reactedValues: Array<number> = []
          const reactor = yield* makeDrainableWorker(
            (event: { readonly aggregate: { readonly id: string } }) =>
              projectionValue(event.aggregate.id).pipe(
                Effect.tap((value) =>
                  Effect.sync(() => {
                    if (value !== undefined) {
                      reactedValues.push(value)
                    }
                  }),
                ),
                Effect.asVoid,
              ),
          )
          const decisions = { count: 0 }
          const worker = yield* makeCommandWorker(makeOptions(reactor, decisions))
          const published = yield* Stream.runHead(worker.streamEvents).pipe(Effect.forkScoped)
          yield* Effect.yieldNow

          const receipts = yield* Effect.all(
            [
              worker.dispatch(command("bbbbbbbb-0000-4000-8000-000000000011", "shared", 1)),
              worker.dispatch(command("bbbbbbbb-0000-4000-8000-000000000012", "shared", 2)),
            ],
            { concurrency: "unbounded" },
          )
          yield* worker.drainReactors

          assert.deepStrictEqual(
            receipts.map(({ response }) =>
              response._tag === "accepted" ? response.sequence : undefined,
            ),
            [1, 2],
          )
          assert.strictEqual(yield* projectionValue("shared"), 3)
          assert.strictEqual(yield* worker.readModel({ kind: "counter", id: "shared" }), 3)
          assert.deepStrictEqual(reactedValues, [1, 3])
          assert.strictEqual(Option.getOrUndefined(yield* published)?.sequence, 1)
        }),
      ),
    )

    it.effect("rollback une projection en échec sans receipt ni événement", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const sql = yield* SqlClient
          yield* sql`
            CREATE TABLE counter_projection (
              aggregate_id TEXT PRIMARY KEY,
              value INTEGER NOT NULL
            )
          `
          const reactor = yield* makeDrainableWorker(() => Effect.void)
          const decisions = { count: 0 }
          const worker = yield* makeCommandWorker(makeOptions(reactor, decisions))
          const failedCommand = command(
            "bbbbbbbb-0000-4000-8000-000000000021",
            "rollback",
            13,
          )

          const failure = yield* Effect.flip(worker.dispatch(failedCommand))
          assert.isTrue(failure instanceof ProjectionFailure)
          assert.isUndefined(yield* projectionValue("rollback"))
          assert.deepStrictEqual(yield* worker.readEvents(0), [])
          const receiptRows = yield* sql<{ total: number }>`
            SELECT COUNT(*) AS total
            FROM receipts
            WHERE command_id = ${failedCommand.commandId}
          `
          assert.strictEqual(receiptRows[0]?.total, 0)
          yield* worker.drainReactors
        }),
      ),
    )

    it.effect("démarre chaque TxQueue vide sans rejouer le journal", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        yield* sql`
          CREATE TABLE counter_projection (
            aggregate_id TEXT PRIMARY KEY,
            value INTEGER NOT NULL
          )
        `
        const reacted: Array<number> = []
        yield* Effect.scoped(
          Effect.gen(function* () {
            const reactor = yield* makeDrainableWorker(
              (event: { readonly sequence: number }) =>
                Effect.sync(() => {
                  reacted.push(event.sequence)
                }),
            )
            const worker = yield* makeCommandWorker(makeOptions(reactor, { count: 0 }))
            yield* worker.dispatch(command("bbbbbbbb-0000-4000-8000-000000000031", "boot", 1))
            yield* worker.drainReactors
          }),
        )
        yield* Effect.scoped(
          Effect.gen(function* () {
            const reactor = yield* makeDrainableWorker(
              (event: { readonly sequence: number }) =>
                Effect.sync(() => {
                  reacted.push(event.sequence)
                }),
            )
            const worker = yield* makeCommandWorker(makeOptions(reactor, { count: 0 }))
            yield* worker.drainReactors
          }),
        )
        assert.deepStrictEqual(reacted, [1])
      }),
    )
  })
})
