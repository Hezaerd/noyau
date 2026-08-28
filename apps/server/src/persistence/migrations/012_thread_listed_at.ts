import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Horodatage de position sidebar, distinct de created_at. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`ALTER TABLE projection_threads ADD COLUMN listed_at TEXT`
  yield* sql`
    UPDATE projection_threads
    SET listed_at = created_at
    WHERE listed_at IS NULL
  `
})

export default migration
