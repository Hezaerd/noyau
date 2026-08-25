import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** TurnDiff projeté sur le Turn : ref git hors journal + résumé de fichiers. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`ALTER TABLE projection_turns ADD COLUMN checkpoint_ref TEXT`
  yield* sql`
    ALTER TABLE projection_turns
    ADD COLUMN checkpoint_status TEXT CHECK (checkpoint_status IN ('ready', 'missing', 'error'))
  `
  yield* sql`ALTER TABLE projection_turns ADD COLUMN checkpoint_files_json TEXT`
})

export default migration
