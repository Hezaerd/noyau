import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Last-known model context fill, distinct from the live Session. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`ALTER TABLE projection_threads ADD COLUMN context_used INTEGER`
  yield* sql`ALTER TABLE projection_threads ADD COLUMN context_window INTEGER`
})

export default migration
