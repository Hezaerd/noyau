import { CurrentActor } from "@noyau/contracts/errors"
import { ControlPlaneRpcs, RPC_METHODS } from "@noyau/contracts/rpc"
import { Effect, Stream } from "effect"

import { ControlPlane } from "./control-plane.ts"
import { EditorOpen } from "./editor/editor-open.ts"
import { GitPlane } from "./git/git-plane.ts"
import { PreviewSessions } from "./preview/preview-sessions.ts"

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
  [RPC_METHODS.getSettings]: () =>
    ControlPlane.pipe(Effect.flatMap((service) => service.getSettings)),
  [RPC_METHODS.patchSettings]: (patch) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.patchSettings(patch))),
  [RPC_METHODS.getKeybindings]: () =>
    ControlPlane.pipe(Effect.flatMap((service) => service.getKeybindings)),
  [RPC_METHODS.replaceKeybindings]: (snapshot) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.replaceKeybindings(snapshot))),
  [RPC_METHODS.probe]: () => ControlPlane.pipe(Effect.flatMap((service) => service.probe)),
  [RPC_METHODS.searchWorkspacePaths]: (input) =>
    ControlPlane.pipe(
      Effect.flatMap((service) => service.searchWorkspacePaths(input.projectId, input.query)),
    ),
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
  [RPC_METHODS.previewOpen]: (input) =>
    PreviewSessions.pipe(Effect.flatMap((preview) => preview.open(input))),
  [RPC_METHODS.previewNavigate]: (input) =>
    PreviewSessions.pipe(Effect.flatMap((preview) => preview.navigate(input))),
  [RPC_METHODS.previewList]: (input) =>
    PreviewSessions.pipe(Effect.flatMap((preview) => preview.list(input))),
  [RPC_METHODS.previewClose]: (input) =>
    PreviewSessions.pipe(Effect.flatMap((preview) => preview.close(input))),
  [RPC_METHODS.inspectProjectAgentIntegration]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.inspectProjectAgentIntegration(input))),
  [RPC_METHODS.installProjectAgentIntegration]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.installProjectAgentIntegration(input))),
  [RPC_METHODS.removeProjectAgentIntegration]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.removeProjectAgentIntegration(input))),
  [RPC_METHODS.previewAttachment]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.previewAttachment(input))),
  [RPC_METHODS.getTurnDiff]: (input) =>
    ControlPlane.pipe(Effect.flatMap((service) => service.getTurnDiff(input))),
  [RPC_METHODS.vcsStatus]: (input) => GitPlane.pipe(Effect.flatMap((git) => git.status(input))),
  [RPC_METHODS.subscribeVcsStatus]: (input) =>
    Stream.unwrap(GitPlane.pipe(Effect.map((git) => git.subscribeStatus(input)))),
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
  [RPC_METHODS.gitGithubAccount]: (input) =>
    GitPlane.pipe(Effect.flatMap((git) => git.githubAccount(input))),
  [RPC_METHODS.gitPublishRepository]: (input) =>
    GitPlane.pipe(Effect.flatMap((git) => git.publishRepository(input))),
  [RPC_METHODS.listEditors]: () => EditorOpen.pipe(Effect.flatMap((editors) => editors.list)),
  [RPC_METHODS.openInEditor]: (input) =>
    EditorOpen.pipe(Effect.flatMap((editors) => editors.open(input))),
})
