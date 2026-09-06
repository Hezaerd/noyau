import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

/** Indexes the pending transcript prompts used by shell projections. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient
  yield* sql`
    CREATE INDEX projection_transcript_pending_permission_idx
      ON projection_transcript (thread_id)
      WHERE kind = 'transcript.permission'
        AND json_extract(item, '$.status') = 'pending'
  `
  yield* sql`
    CREATE INDEX projection_transcript_pending_user_input_idx
      ON projection_transcript (thread_id)
      WHERE kind = 'transcript.user-input'
        AND json_extract(item, '$.status') = 'pending'
  `
})
