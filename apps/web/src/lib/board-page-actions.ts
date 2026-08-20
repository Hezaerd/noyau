import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ClientCommandRequest } from "@noyau/protocol/commands"
import type { ProjectId } from "@noyau/protocol/ids"
import type { DispatchResult } from "@noyau/protocol/receipts"
import { type Crypto, Effect } from "effect"

import {
  buildAndDispatchCommand,
  loadBoardSnapshot,
  type ControlPlaneResult,
} from "./control-plane"

export type BoardCommandOutcome = {
  readonly result: ControlPlaneResult<DispatchResult>
  readonly snapshot: ControlPlaneResult<BoardSnapshot>
}

export const refreshBoardEffect = Effect.fn("refreshBoard")(function* (projectId: ProjectId) {
  return yield* Effect.promise(() => loadBoardSnapshot(projectId))
})

export const refreshBoard = (projectId: ProjectId) =>
  Effect.runPromise(refreshBoardEffect(projectId))

export const runBoardCommandEffect = Effect.fn("runBoardCommand")(function* <
  A extends ClientCommandRequest,
  E,
>(projectId: ProjectId, request: Effect.Effect<A, E, Crypto.Crypto>) {
  const result = yield* Effect.promise(() => buildAndDispatchCommand(request))
  const snapshot = yield* Effect.promise(() => loadBoardSnapshot(projectId))
  return { result, snapshot } satisfies BoardCommandOutcome
})

export const runBoardCommand = <A extends ClientCommandRequest, E>(
  projectId: ProjectId,
  request: Effect.Effect<A, E, Crypto.Crypto>,
) => Effect.runPromise(runBoardCommandEffect(projectId, request))
