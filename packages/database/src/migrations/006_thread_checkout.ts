import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Checkout durable du Thread : branche visée et cwd worktree. */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`ALTER TABLE projection_threads ADD COLUMN branch TEXT`
  yield* sql`ALTER TABLE projection_threads ADD COLUMN worktree_path TEXT`
})

export default migration
