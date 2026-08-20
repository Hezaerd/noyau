import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import type { SqlError } from "effect/unstable/sql/SqlError"

import { runMigrations } from "./migrations"
import * as NodeSqliteClient from "./node-sqlite-client"

export interface SqlitePersistenceConfig {
  readonly filename: string
  readonly spanAttributes?: Record<string, unknown>
}

const setupLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient
    yield* sql`PRAGMA journal_mode = WAL`
    yield* sql`PRAGMA busy_timeout = 5000`
    yield* sql`PRAGMA foreign_keys = ON`
    yield* runMigrations()
  }),
)

/**
 * Ouvre l'unique connexion `node:sqlite`, applique les pragmas puis les
 * migrations avant de rendre le `SqlClient` disponible.
 */
export const layer = ({
  filename,
  spanAttributes,
}: SqlitePersistenceConfig): Layer.Layer<SqlClient, SqlError> => {
  const clientLayer = NodeSqliteClient.layer({
    filename,
    ...(spanAttributes === undefined ? {} : { spanAttributes }),
  })
  return setupLayer.pipe(Layer.provideMerge(clientLayer))
}

/** Persistance isolée pour les tests, toujours vide à la construction. */
export const memoryLayer = layer({ filename: ":memory:" })
