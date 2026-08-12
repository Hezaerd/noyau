import { EventCursor, InvalidEventCursor } from "@noyau/protocol/control-plane"
import { ProjectId } from "@noyau/protocol/ids"
import { Effect, Schema } from "effect"

const CursorParts = Schema.Struct({
  version: Schema.Literal("v1"),
  projectId: ProjectId,
  position: Schema.BigIntFromString,
})

const decodeCursorParts = Schema.decodeUnknownEffect(CursorParts)

export const encodeEventCursor = (projectId: ProjectId, position: bigint): EventCursor =>
  EventCursor.make(`v1.${projectId}.${position}`)

export const decodeEventCursor = Effect.fn("decodeEventCursor")(function* (
  cursor: EventCursor | string,
  expectedProjectId: ProjectId,
  highWater: bigint,
) {
  const [version, projectId, position, ...rest] = cursor.split(".")
  if (
    version === undefined ||
    projectId === undefined ||
    position === undefined ||
    rest.length > 0
  ) {
    return yield* new InvalidEventCursor({ cursor })
  }

  const decoded = yield* decodeCursorParts({
    version,
    projectId,
    position,
  }).pipe(Effect.mapError(() => new InvalidEventCursor({ cursor })))

  if (
    decoded.projectId !== expectedProjectId ||
    decoded.position < 0n ||
    decoded.position > highWater
  ) {
    return yield* new InvalidEventCursor({ cursor })
  }

  return decoded.position
})
