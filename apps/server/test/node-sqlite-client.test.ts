import * as NodeSqlite from "node:sqlite"

import { assert, describe, it } from "@effect/vitest"
import * as NodeSqliteClient from "@noyau/server/persistence/node-sqlite-client"
import { Context, Effect, Layer } from "effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { afterEach, vi } from "vitest"

const withClient = <A, E>(
  config: NodeSqliteClient.NodeSqliteClientConfig,
  use: (sql: SqlClient.SqlClient) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const context = yield* Layer.build(NodeSqliteClient.layer(config))
      return yield* use(Context.get(context, SqlClient.SqlClient))
    }),
  )

describe("Node SQLite statement cache", () => {
  afterEach(() => vi.restoreAllMocks())

  it.effect("réutilise une requête préparée avec des bindings différents", () => {
    const prepare = vi.spyOn(NodeSqlite.DatabaseSync.prototype, "prepare")
    return withClient({ filename: ":memory:" }, (sql) =>
      Effect.gen(function* () {
        const query = "SELECT ? AS value"
        const statement = sql.unsafe(query, [1])
        assert.deepStrictEqual(yield* statement, [{ value: 1 }])
        assert.deepStrictEqual(yield* statement, [{ value: 1 }])
        assert.deepStrictEqual(yield* sql.unsafe(query, [2]), [{ value: 2 }])
        assert.strictEqual(
          prepare.mock.calls.filter(([preparedSql]) => preparedSql === query).length,
          1,
        )
      }),
    )
  })

  it.effect("isole les modes objet, valeurs et entiers sûrs sur une entrée partagée", () => {
    const prepare = vi.spyOn(NodeSqlite.DatabaseSync.prototype, "prepare")
    return withClient({ filename: ":memory:" }, (sql) =>
      Effect.gen(function* () {
        const query = "SELECT 42 AS value"
        assert.deepStrictEqual(
          yield* sql.unsafe(query, []).pipe(Effect.provideService(SqlClient.SafeIntegers, true)),
          [{ value: 42n }],
        )
        assert.deepStrictEqual(yield* sql.unsafe(query, []).raw, [{ value: 42 }])
        assert.deepStrictEqual(yield* sql.unsafe(query, []).values, [[42]])
        assert.deepStrictEqual(yield* sql.unsafe(query, []), [{ value: 42 }])
        assert.strictEqual(
          prepare.mock.calls.filter(([preparedSql]) => preparedSql === query).length,
          1,
        )
      }),
    )
  })

  it.effect("contourne le cache pour les exécutions unprepared", () => {
    const prepare = vi.spyOn(NodeSqlite.DatabaseSync.prototype, "prepare")
    return withClient({ filename: ":memory:" }, (sql) =>
      Effect.gen(function* () {
        const query = "SELECT ? AS value"
        yield* sql.unsafe(query, [1]).unprepared
        yield* sql.unsafe(query, [2]).unprepared
        assert.strictEqual(
          prepare.mock.calls.filter(([preparedSql]) => preparedSql === query).length,
          2,
        )
      }),
    )
  })

  it.effect("évince l'entrée la moins récemment utilisée à la capacité configurée", () => {
    const prepare = vi.spyOn(NodeSqlite.DatabaseSync.prototype, "prepare")
    return withClient({ filename: ":memory:", prepareCacheSize: 2 }, (sql) =>
      Effect.gen(function* () {
        yield* sql.unsafe("SELECT 1 AS value")
        yield* sql.unsafe("SELECT 2 AS value")
        yield* sql.unsafe("SELECT 1 AS value")
        yield* sql.unsafe("SELECT 3 AS value")
        yield* sql.unsafe("SELECT 2 AS value")
        assert.strictEqual(prepare.mock.calls.length, 4)
      }),
    )
  })

  it.effect("réutilise une entrée après un changement de schéma compatible", () => {
    const prepare = vi.spyOn(NodeSqlite.DatabaseSync.prototype, "prepare")
    return withClient({ filename: ":memory:" }, (sql) =>
      Effect.gen(function* () {
        yield* sql`CREATE TABLE probe (value INTEGER NOT NULL)`
        const query = "SELECT value FROM probe ORDER BY value"
        assert.deepStrictEqual(yield* sql.unsafe(query), [])
        yield* sql`ALTER TABLE probe ADD COLUMN label TEXT`
        yield* sql`INSERT INTO probe (value, label) VALUES (1, 'one')`
        assert.deepStrictEqual(yield* sql.unsafe(query), [{ value: 1 }])
        assert.strictEqual(
          prepare.mock.calls.filter(([preparedSql]) => preparedSql === query).length,
          1,
        )
      }),
    )
  })
})
