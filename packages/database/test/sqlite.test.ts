import { rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { assert, describe, it, layer } from "@effect/vitest"
import { runMigrations } from "@noyau/database/migrations"
import { layer as sqliteLayer, memoryLayer } from "@noyau/database/sqlite"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

describe("SQLite persistence", () => {
  layer(memoryLayer)((it) => {
    it.effect("applique les pragmas requis et les migrations sans outbox", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        const busy = yield* sql<{ timeout: number }>`PRAGMA busy_timeout`
        const foreignKeys = yield* sql<{ foreign_keys: number }>`PRAGMA foreign_keys`
        const tables = yield* sql<{ name: string }>`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          ORDER BY name
        `

        assert.strictEqual(busy[0]?.timeout, 5_000)
        assert.strictEqual(foreignKeys[0]?.foreign_keys, 1)
        assert.includeMembers(
          tables.map(({ name }) => name),
          ["aggregate_heads", "events", "receipts"],
        )
        assert.notInclude(tables.map(({ name }) => name), "outbox")
        assert.deepStrictEqual(yield* runMigrations(), [])
      }),
    )

    it.effect("annule ensemble journal, projection et receipt", () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient
        yield* sql`CREATE TABLE rollback_probe (value INTEGER NOT NULL)`

        const failure = yield* Effect.exit(
          sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`INSERT INTO rollback_probe (value) VALUES (1)`
              yield* sql`
                INSERT INTO receipts (
                  command_id, aggregate_kind, aggregate_id, command, response, created_at
                ) VALUES ('rollback', 'probe', 'one', '{}', '{}', '2026-08-20T00:00:00.000Z')
              `
              return yield* Effect.fail("rollback")
            }),
          ),
        )
        assert.isTrue(failure._tag === "Failure")

        const projection = yield* sql<{ total: number }>`
          SELECT COUNT(*) AS total FROM rollback_probe
        `
        const receipts = yield* sql<{ total: number }>`
          SELECT COUNT(*) AS total FROM receipts WHERE command_id = 'rollback'
        `
        assert.strictEqual(projection[0]?.total, 0)
        assert.strictEqual(receipts[0]?.total, 0)
      }),
    )
  })

  it.effect("active WAL sur un fichier possédé par la connexion Node", () => {
    const filename = join(
      tmpdir(),
      `noyau-sqlite-${process.pid}-${crypto.randomUUID()}.sqlite`,
    )
    return Effect.gen(function* () {
      const sql = yield* SqlClient
      const rows = yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`
      assert.strictEqual(rows[0]?.journal_mode, "wal")
    }).pipe(
      Effect.provide(sqliteLayer({ filename })),
      Effect.ensuring(
        Effect.sync(() => {
          rmSync(filename, { force: true })
          rmSync(`${filename}-shm`, { force: true })
          rmSync(`${filename}-wal`, { force: true })
        }),
      ),
    )
  })

  it.effect("ferme la connexion avec son Scope", () =>
    Layer.build(sqliteLayer({ filename: ":memory:" })).pipe(Effect.scoped, Effect.asVoid),
  )
})
