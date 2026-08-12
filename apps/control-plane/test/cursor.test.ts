import { assert, describe, it } from "@effect/vitest"
import { decodeEventCursor, encodeEventCursor } from "@noyau/control-plane/cursor"
import { InvalidEventCursor } from "@noyau/protocol/control-plane"
import { ProjectId } from "@noyau/protocol/ids"
import { Effect } from "effect"

const projectId = ProjectId.make("00000000-0000-4000-8000-000000000001")
const otherProjectId = ProjectId.make("00000000-0000-4000-8000-000000000002")

describe("EventCursor", () => {
  it.effect("roundtrips a project position", () =>
    Effect.gen(function* () {
      const cursor = encodeEventCursor(projectId, 42n)
      assert.strictEqual(yield* decodeEventCursor(cursor, projectId, 42n), 42n)
    }),
  )

  it.effect("rejects a cursor bound to another project", () =>
    Effect.gen(function* () {
      const error = yield* decodeEventCursor(
        encodeEventCursor(otherProjectId, 1n),
        projectId,
        1n,
      ).pipe(Effect.flip)
      assert.instanceOf(error, InvalidEventCursor)
    }),
  )

  it.effect("rejects malformed and negative cursors", () =>
    Effect.gen(function* () {
      const malformed = yield* decodeEventCursor("not-a-cursor", projectId, 1n).pipe(Effect.flip)
      const negative = yield* decodeEventCursor(`v1.${projectId}.-1`, projectId, 1n).pipe(
        Effect.flip,
      )
      assert.instanceOf(malformed, InvalidEventCursor)
      assert.instanceOf(negative, InvalidEventCursor)
    }),
  )

  it.effect("rejects a position beyond the high-water mark", () =>
    Effect.gen(function* () {
      const error = yield* decodeEventCursor(encodeEventCursor(projectId, 2n), projectId, 1n).pipe(
        Effect.flip,
      )
      assert.instanceOf(error, InvalidEventCursor)
    }),
  )
})
