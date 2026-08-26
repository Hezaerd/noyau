import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Préférence de modèle durable du Thread ; les catalogues provider restent volatils. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`ALTER TABLE projection_threads ADD COLUMN model_id TEXT`
  yield* sql`ALTER TABLE projection_threads ADD COLUMN reasoning_effort TEXT`
})

export default migration
