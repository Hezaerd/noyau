import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Préférence de modèle d'un Project pour ses nouveaux Threads. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`ALTER TABLE projection_projects ADD COLUMN default_model_selection_json TEXT`
})

export default migration
