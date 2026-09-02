import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Native provider fork lineage and immutable inherited transcript. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`ALTER TABLE projection_threads ADD COLUMN fork_source_thread_id TEXT`
  yield* sql`ALTER TABLE projection_threads ADD COLUMN fork_source_turn_id TEXT`
  yield* sql`ALTER TABLE projection_turns ADD COLUMN provider_fork_point TEXT`
  yield* sql`
    CREATE TABLE projection_inherited_transcript (
      thread_id TEXT NOT NULL REFERENCES projection_threads(thread_id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      item TEXT NOT NULL,
      PRIMARY KEY (thread_id, ordinal)
    )
  `
})
