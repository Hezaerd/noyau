import { BOOT_RECOVERY_LAST_ERROR } from "@noyau/domain/thread/recovery"
import { DateTime, Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const CountRow = Schema.Struct({ count: Schema.Int })
const decodeCountRow = Schema.decodeEffect(CountRow)

/**
 * Marks provider Sessions that cannot still own a process after restart.
 * This is a projection repair pass: it performs no provider I/O and never
 * replays the in-memory TxQueue.
 */
export const recoverSessionsAfterBoot = Effect.fn("recoverSessionsAfterBoot")(function* (
  recoveredAt?: DateTime.Utc,
) {
  const sql = yield* SqlClient
  const updatedAt = DateTime.formatIso(recoveredAt ?? (yield* DateTime.now))

  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const countRows = yield* sql<(typeof CountRow)["Encoded"]>`
        SELECT COUNT(*) AS count
        FROM projection_sessions
        WHERE status IN ('starting', 'running')
      `
      const countRow = countRows[0]
      if (countRow === undefined) {
        return yield* Effect.die("Session recovery count query returned no row")
      }
      const count = (yield* decodeCountRow(countRow).pipe(Effect.orDie)).count
      if (count === 0) {
        return 0
      }

      yield* sql`
        UPDATE projection_turns
        SET state = 'error', completed_at = COALESCE(completed_at, ${updatedAt})
        WHERE state = 'running'
          AND thread_id IN (
            SELECT thread_id
            FROM projection_sessions
            WHERE status IN ('starting', 'running')
          )
      `
      yield* sql`
        UPDATE projection_threads
        SET updated_at = ${updatedAt}
        WHERE thread_id IN (
          SELECT thread_id
          FROM projection_sessions
          WHERE status IN ('starting', 'running')
        )
      `
      yield* sql`
        UPDATE projection_sessions
        SET
          status = 'error',
          last_error = ${BOOT_RECOVERY_LAST_ERROR},
          updated_at = ${updatedAt}
        WHERE status IN ('starting', 'running')
      `
      return count
    }),
  )
})
