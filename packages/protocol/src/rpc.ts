import {
  AgentIntegrationFailed,
  ProjectAgentIntegration,
  ProjectAgentIntegrationInput,
} from "@noyau/protocol/agent-integration"
import {
  AttachmentPreview,
  AttachmentPreviewFailed,
  PreviewAttachmentInput,
} from "@noyau/protocol/attachment-preview"
import { BoardSnapshot } from "@noyau/protocol/board"
import { ClientCommandRequest } from "@noyau/protocol/commands"
import { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import {
  CommandIdConflict,
  Forbidden,
  MissingIdentity,
  ServiceUnavailable,
} from "@noyau/protocol/errors"
import { EventEnvelope } from "@noyau/protocol/events"
import { FilePreview, FilePreviewFailed, PreviewFileInput } from "@noyau/protocol/file-preview"
import {
  GitCommandError,
  GitDraftInput,
  GitDraftResult,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  VcsCreateRefInput,
  VcsCreateRefResult,
  VcsCreateWorktreeInput,
  VcsCreateWorktreeResult,
  VcsListRefsResult,
  VcsScope,
  VcsStatusResult,
  VcsSwitchRefInput,
  VcsSwitchRefResult,
} from "@noyau/protocol/git"
import { EnvironmentId, ProjectId, Sequence, ThreadId } from "@noyau/protocol/ids"
import { ProjectNotFound } from "@noyau/protocol/project/errors"
import { DispatchResult, Rejection } from "@noyau/protocol/receipts"
import { SetShellFocusInput, ShellLiveEvent, ShellSnapshot } from "@noyau/protocol/shell"
import { Schema } from "effect"
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc"

import type { CurrentActor } from "./errors.ts"

export const CATCH_UP_SEQUENCE_MIN = 0
export const CATCH_UP_SEQUENCE_MAX = 1000

/** Un gap hors `[0, 1000]` exige un snapshot frais, pas un replay non borné. */
export const requiresFreshSnapshot = (gap: number): boolean =>
  gap < CATCH_UP_SEQUENCE_MIN || gap > CATCH_UP_SEQUENCE_MAX

export const RPC_METHODS = {
  dispatchCommand: "orchestration.dispatchCommand",
  subscribeShell: "orchestration.subscribeShell",
  subscribeProject: "orchestration.subscribeProject",
  subscribeThread: "orchestration.subscribeThread",
  setShellFocus: "orchestration.setShellFocus",
  previewFile: "workspace.previewFile",
  inspectProjectAgentIntegration: "workspace.inspectProjectAgentIntegration",
  installProjectAgentIntegration: "workspace.installProjectAgentIntegration",
  removeProjectAgentIntegration: "workspace.removeProjectAgentIntegration",
  previewAttachment: "thread.previewAttachment",
  getConfig: "server.getConfig",
  probe: "server.probe",
  vcsStatus: "vcs.status",
  vcsListRefs: "vcs.listRefs",
  vcsSwitchRef: "vcs.switchRef",
  vcsCreateRef: "vcs.createRef",
  vcsCreateWorktree: "vcs.createWorktree",
  gitDraft: "git.draft",
  gitRunStackedAction: "git.runStackedAction",
} as const

/**
 * Authentifie une connexion au control plane et fournit l'acteur vérifié aux
 * handlers. Le client ne choisit jamais l'identité dans le payload métier.
 * Le bearer de lancement accorde tous les scopes locaux.
 */
export class NoyauRpcIdentity extends RpcMiddleware.Service<
  NoyauRpcIdentity,
  { provides: CurrentActor }
>()("@noyau/protocol/rpc/NoyauRpcIdentity", {
  error: Schema.Union([MissingIdentity, Forbidden]),
}) {}

export const ServerConfig = Schema.Struct({
  environmentId: EnvironmentId,
  bundleVersion: Schema.NonEmptyString,
  serverVersion: Schema.NonEmptyString,
  databaseSchemaVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type ServerConfig = (typeof ServerConfig)["Type"]

const subscribeCursor = {
  afterSequence: Schema.optionalKey(Sequence),
  requestCompletionMarker: Schema.optionalKey(Schema.Boolean),
} as const

export const SubscribeShellInput = Schema.Struct(subscribeCursor)
export type SubscribeShellInput = (typeof SubscribeShellInput)["Type"]

export const SubscribeProjectInput = Schema.Struct({
  projectId: ProjectId,
  ...subscribeCursor,
})
export type SubscribeProjectInput = (typeof SubscribeProjectInput)["Type"]

export const SubscribeThreadInput = Schema.Struct({
  threadId: ThreadId,
  ...subscribeCursor,
})
export type SubscribeThreadInput = (typeof SubscribeThreadInput)["Type"]

const streamFrame = <Snapshot extends Schema.Top, Live extends Schema.Top>(
  snapshot: Snapshot,
  live: Live,
) =>
  Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("synchronized"),
    }),
    Schema.Struct({
      kind: Schema.Literal("snapshot"),
      snapshot,
    }),
    Schema.Struct({
      kind: Schema.Literal("event"),
      event: live,
    }),
  ])

export const ShellStreamItem = streamFrame(ShellSnapshot, ShellLiveEvent)
export type ShellStreamItem = (typeof ShellStreamItem)["Type"]

export const ProjectStreamItem = streamFrame(BoardSnapshot, EventEnvelope)
export type ProjectStreamItem = (typeof ProjectStreamItem)["Type"]

export const ThreadStreamItem = streamFrame(ThreadSnapshot, EventEnvelope)
export type ThreadStreamItem = (typeof ThreadStreamItem)["Type"]

export const DispatchCommand = Rpc.make(RPC_METHODS.dispatchCommand, {
  payload: ClientCommandRequest,
  success: DispatchResult,
  error: Schema.Union([Rejection, CommandIdConflict, ServiceUnavailable]),
})

export const GetConfig = Rpc.make(RPC_METHODS.getConfig, {
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: ServiceUnavailable,
})

export const Probe = Rpc.make(RPC_METHODS.probe, {
  payload: Schema.Struct({}),
  success: Schema.Struct({}),
  error: ServiceUnavailable,
})

export const SubscribeShell = Rpc.make(RPC_METHODS.subscribeShell, {
  payload: SubscribeShellInput,
  success: ShellStreamItem,
  error: ServiceUnavailable,
  stream: true,
})

export const SubscribeProject = Rpc.make(RPC_METHODS.subscribeProject, {
  payload: SubscribeProjectInput,
  success: ProjectStreamItem,
  error: ServiceUnavailable,
  stream: true,
})

export const SubscribeThread = Rpc.make(RPC_METHODS.subscribeThread, {
  payload: SubscribeThreadInput,
  success: ThreadStreamItem,
  error: ServiceUnavailable,
  stream: true,
})

export const SetShellFocus = Rpc.make(RPC_METHODS.setShellFocus, {
  payload: SetShellFocusInput,
  success: Schema.Struct({}),
  error: ServiceUnavailable,
})

export const PreviewFile = Rpc.make(RPC_METHODS.previewFile, {
  payload: PreviewFileInput,
  success: FilePreview,
  error: Schema.Union([ProjectNotFound, FilePreviewFailed, ServiceUnavailable]),
})

const agentIntegrationErrors = Schema.Union([
  ProjectNotFound,
  AgentIntegrationFailed,
  ServiceUnavailable,
])

export const InspectProjectAgentIntegration = Rpc.make(RPC_METHODS.inspectProjectAgentIntegration, {
  payload: ProjectAgentIntegrationInput,
  success: ProjectAgentIntegration,
  error: Schema.Union([ProjectNotFound, ServiceUnavailable]),
})

export const InstallProjectAgentIntegration = Rpc.make(RPC_METHODS.installProjectAgentIntegration, {
  payload: ProjectAgentIntegrationInput,
  success: ProjectAgentIntegration,
  error: agentIntegrationErrors,
})

export const RemoveProjectAgentIntegration = Rpc.make(RPC_METHODS.removeProjectAgentIntegration, {
  payload: ProjectAgentIntegrationInput,
  success: ProjectAgentIntegration,
  error: agentIntegrationErrors,
})

export const PreviewAttachment = Rpc.make(RPC_METHODS.previewAttachment, {
  payload: PreviewAttachmentInput,
  success: AttachmentPreview,
  error: Schema.Union([AttachmentPreviewFailed, ServiceUnavailable]),
})

export const VcsStatus = Rpc.make(RPC_METHODS.vcsStatus, {
  payload: VcsScope,
  success: VcsStatusResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const VcsListRefs = Rpc.make(RPC_METHODS.vcsListRefs, {
  payload: VcsScope,
  success: VcsListRefsResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const VcsSwitchRef = Rpc.make(RPC_METHODS.vcsSwitchRef, {
  payload: VcsSwitchRefInput,
  success: VcsSwitchRefResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const VcsCreateRef = Rpc.make(RPC_METHODS.vcsCreateRef, {
  payload: VcsCreateRefInput,
  success: VcsCreateRefResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const VcsCreateWorktree = Rpc.make(RPC_METHODS.vcsCreateWorktree, {
  payload: VcsCreateWorktreeInput,
  success: VcsCreateWorktreeResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const GitDraft = Rpc.make(RPC_METHODS.gitDraft, {
  payload: GitDraftInput,
  success: GitDraftResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const GitRunStackedAction = Rpc.make(RPC_METHODS.gitRunStackedAction, {
  payload: GitRunStackedActionInput,
  success: GitRunStackedActionResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

/** Contrat unique client/serveur du control plane sur WebSocket. */
export const ControlPlaneRpcs = RpcGroup.make(
  DispatchCommand,
  GetConfig,
  Probe,
  SubscribeShell,
  SubscribeProject,
  SubscribeThread,
  SetShellFocus,
  PreviewFile,
  InspectProjectAgentIntegration,
  InstallProjectAgentIntegration,
  RemoveProjectAgentIntegration,
  PreviewAttachment,
  VcsStatus,
  VcsListRefs,
  VcsSwitchRef,
  VcsCreateRef,
  VcsCreateWorktree,
  GitDraft,
  GitRunStackedAction,
).middleware(NoyauRpcIdentity)

export type ControlPlaneRpcs = typeof ControlPlaneRpcs
