import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it as standaloneIt, layer } from "@effect/vitest"
import { runMigrations } from "@noyau/database/migrations"
import { layer as sqliteLayer, memoryLayer } from "@noyau/database/sqlite"
import { Context, Effect, FileSystem, Layer, Path } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, Path.layer)

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
          [
            "aggregate_heads",
            "events",
            "projection_columns",
            "projection_projects",
            "projection_sessions",
            "projection_threads",
            "projection_tickets",
            "projection_transcript",
            "projection_turns",
            "receipts",
          ],
        )
        assert.notInclude(
          tables.map(({ name }) => name),
          "outbox",
        )
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

  layer(platformLayer)((it) => {
    it.effect("active WAL sur un fichier possédé par la connexion Node", () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-sqlite-" })
        const filename = path.join(directory, "state.sqlite")
        const context = yield* Layer.build(sqliteLayer({ filename }))
        const sql = Context.get(context, SqlClient)
        const rows = yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`
        assert.strictEqual(rows[0]?.journal_mode, "wal")
      }),
    )
  })

  standaloneIt.effect("ferme la connexion avec son Scope", () =>
    Layer.build(sqliteLayer({ filename: ":memory:" })).pipe(Effect.scoped, Effect.asVoid),
  )
})
