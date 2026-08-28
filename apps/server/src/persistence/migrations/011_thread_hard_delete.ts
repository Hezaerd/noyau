import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/**
 * La suppression de Thread retire la ligne projetée. CASCADE enlève Session,
 * Turns, transcript et TicketThreads. Les Threads encore archivés quittent
 * le read model.
 */
const migration = Effect.gen(function* () {
  const sql = yield* SqlClient

  yield* sql`
    DELETE FROM projection_threads
    WHERE status = 'archived' OR archived_at IS NOT NULL
  `
})

export default migration
