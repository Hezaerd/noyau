import { CurrentActor } from "@noyau/protocol/errors"
import { ControlPlaneRpcs, RPC_METHODS } from "@noyau/protocol/rpc"
import { Effect, Stream } from "effect"

import { ControlPlane } from "./control-plane.ts"
import { GitPlane } from "./git/git-plane.ts"

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
  [RPC_METHODS.setShellFocus]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.setShellFocus(input))),
  [RPC_METHODS.previewFile]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.previewFile(input))),
  [RPC_METHODS.inspectProjectAgentIntegration]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.inspectProjectAgentIntegration(input))),
  [RPC_METHODS.installProjectAgentIntegration]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.installProjectAgentIntegration(input))),
  [RPC_METHODS.removeProjectAgentIntegration]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.removeProjectAgentIntegration(input))),
  [RPC_METHODS.previewAttachment]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.previewAttachment(input))),
  [RPC_METHODS.vcsStatus]: (input) => GitPlane.pipe(Effect.flatMap((git) => git.status(input))),
  [RPC_METHODS.vcsListRefs]: (input) => GitPlane.pipe(Effect.flatMap((git) => git.listRefs(input))),
  [RPC_METHODS.vcsSwitchRef]: (input) =>
    GitPlane.pipe(Effect.flatMap((git) => git.switchRef(input))),
  [RPC_METHODS.vcsCreateRef]: (input) =>
    GitPlane.pipe(Effect.flatMap((git) => git.createRef(input))),
  [RPC_METHODS.vcsCreateWorktree]: (input) =>
    GitPlane.pipe(Effect.flatMap((git) => git.createWorktree(input))),
  [RPC_METHODS.gitDraft]: (input) => GitPlane.pipe(Effect.flatMap((git) => git.draft(input))),
  [RPC_METHODS.gitRunStackedAction]: (input) =>
    GitPlane.pipe(Effect.flatMap((git) => git.runStackedAction(input))),
})
