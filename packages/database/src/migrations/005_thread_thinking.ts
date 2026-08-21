import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Préférence de réflexion Cursor durable associée au Thread. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`ALTER TABLE projection_threads ADD COLUMN thinking INTEGER CHECK (thinking IN (0, 1))`
})

export default migration
