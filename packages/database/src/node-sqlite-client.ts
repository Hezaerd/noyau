import * as NodeSqlite from "node:sqlite"

import { Config, Context, Effect, Fiber, Layer, Schema, Scope, Semaphore, Stream } from "effect"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import type { Connection } from "effect/unstable/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError"
import * as Statement from "effect/unstable/sql/Statement"

export interface NodeSqliteClientConfig {
  readonly filename: string
  readonly readonly?: boolean
}

export class UnsupportedNodeSqliteVersion extends Schema.TaggedError<UnsupportedNodeSqliteVersion>()(
  "UnsupportedNodeSqliteVersion",
  {
    nodeVersion: Schema.String,
  },
) {}

export class UnsupportedNodeSqliteOperation extends Schema.TaggedError<UnsupportedNodeSqliteOperation>()(
  "UnsupportedNodeSqliteOperation",
  {},
) {}

// `StatementSync.columns()` exists on Node 22.16+ / 23.11+ / 24.
const checkCompatibility = Effect.sync(() => {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number)
  const supported = (major === 22 && minor >= 16) || (major === 23 && minor >= 11) || major >= 24
  if (supported) {
    return
  }
  throw new UnsupportedNodeSqliteVersion({ nodeVersion: process.versions.node })
})

const sqlError = (message: string, operation: string, cause: unknown) =>
  new SqlError({
    reason: classifySqliteError(cause, { message, operation }),
  })

const SqlInputValue = Schema.Union([
  Schema.Null,
  Schema.String,
  Schema.Finite,
  Schema.BigInt,
  Schema.Uint8Array,
])
const decodeSqlInputValue = Schema.decodeUnknownSync(SqlInputValue)
const bindParameters = (params: ReadonlyArray<unknown>) =>
  params.map((parameter) => decodeSqlInputValue(parameter))

const hasRows = (query: string) =>
  /^\s*(?:EXPLAIN|PRAGMA|SELECT|WITH)\b/iu.test(query) || /\bRETURNING\b/iu.test(query)

const make = Effect.fn("NodeSqliteClient.make")(function* (config: NodeSqliteClientConfig) {
  yield* checkCompatibility
  const compiler = Statement.makeCompilerSqlite()

  const connection = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        new NodeSqlite.DatabaseSync(config.filename, {
          readOnly: config.readonly ?? false,
        }),
      catch: (cause) => sqlError("Failed to open database", "open", cause),
    }),
    (database) =>
      Effect.try({
        try: () => database.close(),
        catch: (cause) => sqlError("Failed to close database", "close", cause),
      }).pipe(Effect.orDie),
  )

  const prepare = (query: string) =>
    Effect.try({
      try: () => connection.prepare(query),
      catch: (cause) => sqlError("Failed to prepare statement", "prepare", cause),
    })

  const executeRows = (
    query: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
  ) =>
    prepare(query).pipe(
      Effect.flatMap((statement) =>
        Effect.withFiber((fiber) =>
          Effect.try({
            try: () => {
              statement.setReadBigInts(Context.get(fiber.context, SqlClient.SafeIntegers))
              if (hasRows(query)) {
                const rows = statement.all(...bindParameters(params))
                return transformRows === undefined ? rows : transformRows(rows)
              }
              statement.run(...bindParameters(params))
              return []
            },
            catch: (cause) => sqlError("Failed to execute statement", "execute", cause),
          }),
        ),
      ),
    )

  const executeRaw = (query: string, params: ReadonlyArray<unknown>) =>
    prepare(query).pipe(
      Effect.flatMap((statement) =>
        Effect.try({
          try: () =>
            hasRows(query)
              ? statement.all(...bindParameters(params))
              : statement.run(...bindParameters(params)),
          catch: (cause) => sqlError("Failed to execute statement", "execute", cause),
        }),
      ),
    )

  const executeValues = (query: string, params: ReadonlyArray<unknown>) =>
    prepare(query).pipe(
      Effect.flatMap((statement) =>
        Effect.acquireUseRelease(
          Effect.sync(() => {
            statement.setReturnArrays(true)
            return statement
          }),
          (arrayStatement) =>
            Effect.try({
              try: () => {
                if (!hasRows(query)) {
                  arrayStatement.run(...bindParameters(params))
                  return []
                }
                return arrayStatement
                  .all(...bindParameters(params))
                  .map((row) => (Array.isArray(row) ? row : Object.values(row)))
              },
              catch: (cause) => sqlError("Failed to execute statement", "execute", cause),
            }),
          (arrayStatement) => Effect.sync(() => arrayStatement.setReturnArrays(false)),
        ),
      ),
    )

  const driverConnection: Connection = {
    execute: executeRows,
    executeRaw,
    executeStream: () => Stream.die(new UnsupportedNodeSqliteOperation()),
    executeUnprepared: executeRows,
    executeValues,
    executeValuesUnprepared: executeValues,
  }

  const semaphore = yield* Semaphore.make(1)
  const acquirer = semaphore.withPermits(1)(Effect.succeed(driverConnection))
  const transactionAcquirer = Effect.uninterruptibleMask((restore) => {
    const fiber = Fiber.getCurrent()
    if (fiber === undefined) {
      return Effect.die("NodeSqliteClient transaction has no current fiber")
    }
    const scope = Context.getUnsafe(fiber.context, Scope.Scope)
    return restore(semaphore.take(1)).pipe(
      Effect.tap(() => Scope.addFinalizer(scope, semaphore.release(1))),
      Effect.as(driverConnection),
    )
  })

  return yield* SqlClient.make({
    acquirer,
    compiler,
    transactionAcquirer,
    spanAttributes: [["db.system.name", "sqlite"]],
  })
})

export const layer = (config: NodeSqliteClientConfig): Layer.Layer<SqlClient.SqlClient, SqlError> =>
  Layer.effect(SqlClient.SqlClient, make(config)).pipe(Layer.provide(Reactivity.layer))

export const layerConfig = (
  config: Config.Wrap<NodeSqliteClientConfig>,
): Layer.Layer<SqlClient.SqlClient, Config.ConfigError | SqlError> =>
  Layer.effect(SqlClient.SqlClient, Config.unwrap(config).pipe(Effect.flatMap(make))).pipe(
    Layer.provide(Reactivity.layer),
  )
