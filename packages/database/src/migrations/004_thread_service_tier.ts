import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Tier provider durable associé à la sélection de modèle du Thread. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`ALTER TABLE projection_threads ADD COLUMN service_tier TEXT`
})

export default migration
