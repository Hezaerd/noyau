import { CurrentActor } from "@noyau/protocol/errors"
import { ControlPlaneRpcs, RPC_METHODS } from "@noyau/protocol/rpc"
import { Effect, Stream } from "effect"

import { ControlPlane } from "./control-plane"

export const rpcHandlersLayer = ControlPlaneRpcs.toLayer({
  [RPC_METHODS.dispatchCommand]: (request) =>
    Effect.gen(function* () {
      const actorId = yield* CurrentActor
      const controlPlane = yield* ControlPlane
      yield* Effect.annotateCurrentSpan({
        "noyau.actor_id": actorId,
        "noyau.command_id": request.commandId,
        "noyau.command_type": request._tag,
      })
      return yield* controlPlane.dispatch(request, actorId)
    }),
  [RPC_METHODS.getConfig]: () => ControlPlane.pipe(Effect.flatMap((service) => service.getConfig)),
  [RPC_METHODS.probe]: () => ControlPlane.pipe(Effect.flatMap((service) => service.probe)),
  [RPC_METHODS.subscribeShell]: (input) =>
    Stream.unwrap(ControlPlane.pipe(Effect.map((service) => service.subscribeShell(input)))),
  [RPC_METHODS.subscribeProject]: (input) =>
    Stream.unwrap(ControlPlane.pipe(Effect.map((service) => service.subscribeProject(input)))),
  [RPC_METHODS.subscribeThread]: (input) =>
    Stream.unwrap(ControlPlane.pipe(Effect.map((service) => service.subscribeThread(input)))),
})
