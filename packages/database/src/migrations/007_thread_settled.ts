import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Cycle settle du Thread : override utilisateur et horodatage. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN settled_override TEXT CHECK (settled_override IN ('settled', 'active'))
  `
  yield* sql`ALTER TABLE projection_threads ADD COLUMN settled_at TEXT`
})

export default migration
