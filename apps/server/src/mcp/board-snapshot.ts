import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ProjectId } from "@noyau/protocol/ids"
import type { ProjectStreamItem } from "@noyau/protocol/rpc"
import { ControlPlane } from "@noyau/server/control-plane"
import { Effect, Option, Schema, Stream } from "effect"

export class BoardSnapshotUnavailable extends Schema.TaggedError<BoardSnapshotUnavailable>()(
  "BoardSnapshotUnavailable",
  { message: Schema.NonEmptyString },
) {}

export const readBoardSnapshot = Effect.fn("NoyauMcp.readBoardSnapshot")(function* (
  projectId: ProjectId,
) {
  const controlPlane = yield* ControlPlane
  const frame = yield* controlPlane.subscribeProject({ projectId }).pipe(
    Stream.filter(
      (item): item is Extract<ProjectStreamItem, { readonly kind: "snapshot" }> =>
        item.kind === "snapshot",
    ),
    Stream.runHead,
    Effect.mapError(
      () => new BoardSnapshotUnavailable({ message: "The Noyau board is unavailable." }),
    ),
  )
  if (Option.isNone(frame)) {
    return yield* new BoardSnapshotUnavailable({
      message: "The Noyau board stream ended before returning a snapshot.",
    })
  }
  return frame.value.snapshot
})

export type BoardSnapshotValue = BoardSnapshot
