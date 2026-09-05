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
  readonly prepareCacheSize?: number
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
const checkCompatibility = Effect.gen(function* () {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number)
  const supported = (major === 22 && minor >= 16) || (major === 23 && minor >= 11) || major >= 24
  if (!supported) {
    return yield* new UnsupportedNodeSqliteVersion({ nodeVersion: process.versions.node })
  }
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
  const configuredCacheSize = config.prepareCacheSize ?? 200
  const prepareCacheSize = Number.isFinite(configuredCacheSize)
    ? Math.max(0, Math.floor(configuredCacheSize))
    : 200
  const prepareCache = new Map<string, NodeSqlite.StatementSync>()

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
        try: () => {
          prepareCache.clear()
          database.close()
        },
        catch: (cause) => sqlError("Failed to close database", "close", cause),
      }).pipe(Effect.orDie),
  )

  const prepareUncached = (query: string) =>
    Effect.try({
      try: () => connection.prepare(query),
      catch: (cause) => sqlError("Failed to prepare statement", "prepare", cause),
    })

  const prepare = (query: string) =>
    Effect.suspend(() => {
      const cached = prepareCache.get(query)
      if (cached !== undefined) {
        prepareCache.delete(query)
        prepareCache.set(query, cached)
        return Effect.succeed(cached)
      }
      return prepareUncached(query).pipe(
        Effect.tap((statement) =>
          Effect.sync(() => {
            if (prepareCacheSize === 0) return
            prepareCache.set(query, statement)
            if (prepareCache.size > prepareCacheSize) {
              const oldest = prepareCache.keys().next().value
              if (oldest !== undefined) prepareCache.delete(oldest)
            }
          }),
        ),
      )
    })

  const executeRowsWith = (
    statement: NodeSqlite.StatementSync,
    query: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
  ) =>
    Effect.withFiber((fiber) =>
      Effect.try({
        try: () => {
          statement.setReadBigInts(Context.get(fiber.context, SqlClient.SafeIntegers))
          statement.setReturnArrays(false)
          if (hasRows(query)) {
            const rows = statement.all(...bindParameters(params))
            return transformRows === undefined ? rows : transformRows(rows)
          }
          statement.run(...bindParameters(params))
          return []
        },
        catch: (cause) => sqlError("Failed to execute statement", "execute", cause),
      }),
    )

  const executeRows = (
    query: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
  ) =>
    prepare(query).pipe(
      Effect.flatMap((statement) => executeRowsWith(statement, query, params, transformRows)),
    )

  const executeRaw = (query: string, params: ReadonlyArray<unknown>) =>
    prepare(query).pipe(
      Effect.flatMap((statement) =>
        Effect.try({
          try: () => {
            statement.setReadBigInts(false)
            statement.setReturnArrays(false)
            return hasRows(query)
              ? statement.all(...bindParameters(params))
              : statement.run(...bindParameters(params))
          },
          catch: (cause) => sqlError("Failed to execute statement", "execute", cause),
        }),
      ),
    )

  const executeValuesWith = (
    statement: NodeSqlite.StatementSync,
    query: string,
    params: ReadonlyArray<unknown>,
    resetReturnArrays: boolean,
  ) =>
    Effect.try({
      try: () => {
        statement.setReadBigInts(false)
        statement.setReturnArrays(true)
        try {
          if (!hasRows(query)) {
            statement.run(...bindParameters(params))
            return []
          }
          return statement
            .all(...bindParameters(params))
            .map((row) => (Array.isArray(row) ? row : Object.values(row)))
        } finally {
          if (resetReturnArrays) {
            statement.setReturnArrays(false)
          }
        }
      },
      catch: (cause) => sqlError("Failed to execute statement", "execute", cause),
    })

  const executeValues = (query: string, params: ReadonlyArray<unknown>) =>
    prepare(query).pipe(
      Effect.flatMap((statement) => executeValuesWith(statement, query, params, true)),
    )

  const executeRowsUnprepared = (
    query: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined,
  ) =>
    prepareUncached(query).pipe(
      Effect.flatMap((statement) => executeRowsWith(statement, query, params, transformRows)),
    )

  const executeValuesUnprepared = (query: string, params: ReadonlyArray<unknown>) =>
    prepareUncached(query).pipe(
      Effect.flatMap((statement) => executeValuesWith(statement, query, params, false)),
    )

  const driverConnection: Connection = {
    execute: executeRows,
    executeRaw,
    executeStream: () => Stream.die(new UnsupportedNodeSqliteOperation()),
    executeUnprepared: executeRowsUnprepared,
    executeValues,
    executeValuesUnprepared,
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

export const layer = (
  config: NodeSqliteClientConfig,
): Layer.Layer<SqlClient.SqlClient, SqlError | UnsupportedNodeSqliteVersion> =>
  Layer.effect(SqlClient.SqlClient, make(config)).pipe(Layer.provide(Reactivity.layer))

export const layerConfig = (
  config: Config.Wrap<NodeSqliteClientConfig>,
): Layer.Layer<SqlClient.SqlClient, Config.ConfigError | SqlError | UnsupportedNodeSqliteVersion> =>
  Layer.effect(SqlClient.SqlClient, Config.unwrap(config).pipe(Effect.flatMap(make))).pipe(
    Layer.provide(Reactivity.layer),
  )
