import * as NodeSqlite from "node:sqlite"

import {
  Config,
  Context,
  Effect,
  Fiber,
  Layer,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from "effect"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import type { Connection } from "effect/unstable/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError"
import * as Statement from "effect/unstable/sql/Statement"

export interface NodeSqliteClientConfig {
  readonly filename: string
  readonly readonly?: boolean
  readonly spanAttributes?: Record<string, unknown>
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

const checkCompatibility = Effect.sync(() => {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number)
  if ((major === 22 && minor >= 16) || (major === 23 && minor >= 11) || major >= 24) {
    return
  }
  throw new UnsupportedNodeSqliteVersion({ nodeVersion: process.versions.node })
})

const sqlError = (message: string, operation: string, cause: unknown) =>
  new SqlError({
    reason: classifySqliteError(cause, { message, operation }),
  })

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

  const bindParameters = (params: ReadonlyArray<unknown>) => {
    // SqlClient parameters have already passed through the SQLite compiler.
    return params as ReadonlyArray<NodeSqlite.SQLInputValue>
  }

  const hasRows = (statement: NodeSqlite.StatementSync) => statement.columns().length > 0

  const execute = (
    query: string,
    params: ReadonlyArray<unknown>,
    raw: boolean,
  ): Effect.Effect<ReadonlyArray<object> | unknown, SqlError> =>
    prepare(query).pipe(
      Effect.flatMap((statement) =>
        Effect.withFiber((fiber) =>
          Effect.try({
            try: () => {
              statement.setReadBigInts(Boolean(Context.get(fiber.context, SqlClient.SafeIntegers)))
              if (hasRows(statement)) {
                return statement.all(...bindParameters(params))
              }
              const result = statement.run(...bindParameters(params))
              return raw ? result : []
            },
            catch: (cause) => sqlError("Failed to execute statement", "execute", cause),
          }),
        ),
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
                if (!hasRows(arrayStatement)) {
                  arrayStatement.run(...bindParameters(params))
                  return []
                }
                return arrayStatement.all(...bindParameters(params))
              },
              catch: (cause) => sqlError("Failed to execute statement", "execute", cause),
            }),
          (arrayStatement) => Effect.sync(() => arrayStatement.setReturnArrays(false)),
        ),
      ),
    )

  const driverConnection: Connection = {
    execute: (query, params, transformRows) =>
      execute(query, params, false).pipe(
        Effect.map((rows) => {
          const typedRows = rows as ReadonlyArray<object>
          return transformRows === undefined ? typedRows : transformRows(typedRows)
        }),
      ),
    executeRaw: (query, params) => execute(query, params, true),
    executeStream: () => Stream.fail(new UnsupportedNodeSqliteOperation()),
    executeUnprepared: (query, params, transformRows) =>
      execute(query, params, false).pipe(
        Effect.map((rows) => {
          const typedRows = rows as ReadonlyArray<object>
          return transformRows === undefined ? typedRows : transformRows(typedRows)
        }),
      ),
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
    spanAttributes: [
      ["db.system.name", "sqlite"],
      ...Object.entries(config.spanAttributes ?? {}),
    ],
  })
})

export const layer = (
  config: NodeSqliteClientConfig,
): Layer.Layer<SqlClient.SqlClient, SqlError> =>
  Layer.effect(SqlClient.SqlClient, make(config)).pipe(Layer.provide(Reactivity.layer))

export const layerConfig = (
  config: Config.Wrap<NodeSqliteClientConfig>,
): Layer.Layer<SqlClient.SqlClient, Config.ConfigError | SqlError> =>
  Layer.effect(SqlClient.SqlClient, Config.unwrap(config).pipe(Effect.flatMap(make))).pipe(
    Layer.provide(Reactivity.layer),
  )
