import { InternalCommand } from "@noyau/contracts/commands"
import {
  ActorId,
  ApprovalRequestId,
  CommandId,
  CorrelationId,
  ProjectId,
  ThreadId,
} from "@noyau/contracts/ids"
import { Crypto, DateTime, Effect, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const PendingUserInputRow = Schema.Struct({
  project_id: Schema.String,
  thread_id: Schema.String,
  request_id: Schema.String,
})
const decodePendingUserInputRow = Schema.decodeEffect(PendingUserInputRow)
const decodeInternalCommand = Schema.decodeUnknownEffect(InternalCommand)
const recoveryActor = ActorId.make("system:user-input-recovery")

const uuidFromDigest = (digest: Uint8Array): string => {
  const bytes = digest.slice(0, 16)
  const versionByte = bytes[6]
  const variantByte = bytes[8]
  if (versionByte === undefined || variantByte === undefined) {
    throw new Error("SHA-256 digest is shorter than 16 bytes")
  }
  bytes[6] = (versionByte & 0x0f) | 0x50
  bytes[8] = (variantByte & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export type DispatchRecoveredUserInput = (
  command: (typeof InternalCommand)["Type"],
) => Effect.Effect<void>

/** Persists pending callback loss before the Server becomes available to clients. */
export const recoverPendingUserInputsAfterBoot = Effect.fn("recoverPendingUserInputsAfterBoot")(
  function* (dispatch: DispatchRecoveredUserInput) {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const recoveredAt = yield* DateTime.now
    const rows = yield* sql<(typeof PendingUserInputRow)["Encoded"]>`
    SELECT
      threads.project_id,
      transcript.thread_id,
      json_extract(transcript.item, '$.requestId') AS request_id
    FROM projection_transcript AS transcript
    JOIN projection_threads AS threads ON threads.thread_id = transcript.thread_id
    WHERE transcript.kind = 'transcript.user-input'
      AND json_extract(transcript.item, '$.status') = 'pending'
    ORDER BY transcript.thread_id, transcript.ordinal
  `
    for (const encoded of rows) {
      const row = yield* decodePendingUserInputRow(encoded).pipe(Effect.orDie)
      const identity = `user-input-recovery:${row.thread_id}:${row.request_id}`
      const digest = yield* crypto
        .digest("SHA-256", new TextEncoder().encode(identity))
        .pipe(Effect.orDie)
      const recoveryId = uuidFromDigest(digest)
      const command = yield* decodeInternalCommand({
        _tag: "user-input.detach",
        commandId: CommandId.make(recoveryId),
        projectId: ProjectId.make(row.project_id),
        actorId: recoveryActor,
        correlationId: CorrelationId.make(recoveryId),
        issuedAt: DateTime.formatIso(recoveredAt),
        schemaVersion: 1,
        payload: {
          threadId: ThreadId.make(row.thread_id),
          requestId: ApprovalRequestId.make(row.request_id),
        },
      }).pipe(Effect.orDie)
      yield* dispatch(command)
    }
    return rows.length
  },
)
