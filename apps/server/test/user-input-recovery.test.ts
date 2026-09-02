import { createHash } from "node:crypto"

import { assert, describe, it } from "@effect/vitest"
import type { InternalCommand } from "@noyau/contracts/commands"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import { recoverPendingUserInputsAfterBoot } from "@noyau/server/persistence/user-input-recovery"
import { Crypto, Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const projectId = "10000000-0000-4000-8000-000000000001"
const threadId = "20000000-0000-4000-8000-000000000001"
const turnId = "30000000-0000-4000-8000-000000000001"
const timestamp = "2026-09-02T12:00:00.000Z"

const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (algorithm, data) =>
    Effect.succeed(
      new Uint8Array(createHash(algorithm.toLowerCase().replace("-", "")).update(data).digest()),
    ),
})

describe("pending user-input boot recovery", () => {
  it.effect("dispatches stable detach commands only for persisted pending callbacks", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const services = yield* Layer.build(
          Layer.merge(memoryLayer, Layer.succeed(Crypto.Crypto)(crypto)),
        )
        return yield* Effect.gen(function* () {
          const sql = yield* SqlClient
          yield* sql`
          INSERT INTO projection_projects (
            project_id, name, workspace_root, available, created_at, updated_at
          ) VALUES (${projectId}, 'Project', '/tmp/recovery', 1, ${timestamp}, ${timestamp})
        `
          yield* sql`
          INSERT INTO projection_threads (
            thread_id, project_id, title, provider, runtime_mode, status, created_at, updated_at
          ) VALUES (
            ${threadId}, ${projectId}, 'Recovery', 'codex', 'full-access', 'active',
            ${timestamp}, ${timestamp}
          )
        `
          yield* sql`
          INSERT INTO projection_turns (
            turn_id, thread_id, ordinal, state, requested_at, started_at
          ) VALUES (${turnId}, ${threadId}, 1, 'error', ${timestamp}, ${timestamp})
        `
          const item = (requestId: string, status: string) =>
            JSON.stringify({
              _tag: "transcript.user-input",
              threadId,
              turnId,
              requestId,
              prompt: "Choose",
              status,
            })
          yield* sql`
          INSERT INTO projection_transcript (
            transcript_id, thread_id, turn_id, ordinal, kind, item, event_sequence
          ) VALUES
            ('pending', ${threadId}, ${turnId}, 1, 'transcript.user-input', ${item("ask-1", "pending")}, 1),
            ('resolved', ${threadId}, ${turnId}, 2, 'transcript.user-input', ${item("ask-2", "resolved")}, 2)
        `

          const first: Array<InternalCommand> = []
          const recovered = yield* recoverPendingUserInputsAfterBoot((command) =>
            Effect.sync(() => {
              first.push(command)
            }),
          )
          const second: Array<InternalCommand> = []
          yield* recoverPendingUserInputsAfterBoot((command) =>
            Effect.sync(() => {
              second.push(command)
            }),
          )

          assert.strictEqual(recovered, 1)
          assert.lengthOf(first, 1)
          const recoveredCommand = first[0]
          assert.strictEqual(recoveredCommand?._tag, "user-input.detach")
          if (recoveredCommand?._tag !== "user-input.detach") {
            throw new Error("Expected a user-input.detach command")
          }
          assert.strictEqual(recoveredCommand.projectId, projectId)
          assert.strictEqual(recoveredCommand.payload.threadId, threadId)
          assert.strictEqual(recoveredCommand.payload.requestId, "ask-1")
          assert.strictEqual(second[0]?.commandId, first[0]?.commandId)
        }).pipe(Effect.provide(services))
      }),
    ),
  )
})
