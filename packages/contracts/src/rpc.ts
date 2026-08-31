import {
  AgentIntegrationFailed,
  ProjectAgentIntegration,
  ProjectAgentIntegrationInput,
} from "@noyau/contracts/agent-integration"
import {
  AttachmentPreview,
  AttachmentPreviewFailed,
  PreviewAttachmentInput,
} from "@noyau/contracts/attachment-preview"
import { BoardSnapshot } from "@noyau/contracts/board"
import { ClientCommandRequest } from "@noyau/contracts/commands"
import {
  ListEditorsResult,
  OpenInEditorFailed,
  OpenInEditorInput,
  OpenInEditorResult,
} from "@noyau/contracts/editor"
import { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import { WorkspacePathSearchResult } from "@noyau/contracts/entities/workspace-path"
import {
  CommandIdConflict,
  Forbidden,
  MissingIdentity,
  ServiceUnavailable,
} from "@noyau/contracts/errors"
import { EventEnvelope } from "@noyau/contracts/events"
import { FilePreview, FilePreviewFailed, PreviewFileInput } from "@noyau/contracts/file-preview"
import {
  GitCommandError,
  GitDraftInput,
  GitDraftResult,
  GitGetPullRequestInput,
  GitHubAccountResult,
  GitPublishRepositoryInput,
  GitPublishRepositoryResult,
  GitPullRequest,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  VcsCreateRefInput,
  VcsCreateRefResult,
  VcsCreateWorktreeInput,
  VcsCreateWorktreeResult,
  VcsListRefsResult,
  VcsScope,
  VcsStatusResult,
  VcsStatusStreamEvent,
  VcsSwitchRefInput,
  VcsSwitchRefResult,
} from "@noyau/contracts/git"
import { EnvironmentId, ProjectId, Sequence, ThreadId } from "@noyau/contracts/ids"
import { KeybindingsError, KeybindingsSnapshot } from "@noyau/contracts/keybindings"
import {
  PreviewCloseInput,
  PreviewCloseResult,
  PreviewListInput,
  PreviewListResult,
  PreviewNavigateInput,
  PreviewOpenInput,
  PreviewSessionSnapshot,
  PreviewTabNotFound,
  PreviewUrlInvalid,
} from "@noyau/contracts/preview"
import { ProjectNotFound, ProjectUnavailable } from "@noyau/contracts/project/errors"
import { DispatchResult, Rejection } from "@noyau/contracts/receipts"
import { ServerSettings, ServerSettingsError, ServerSettingsPatch } from "@noyau/contracts/settings"
import { SetShellFocusInput, ShellLiveEvent, ShellSnapshot } from "@noyau/contracts/shell"
import { ThreadAssistantLive } from "@noyau/contracts/thread/live"
import { GetTurnDiffInput, TurnDiffPatch, TurnDiffUnavailable } from "@noyau/contracts/turn-diff"
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
  previewOpen: "preview.open",
  previewNavigate: "preview.navigate",
  previewList: "preview.list",
  previewClose: "preview.close",
  inspectProjectAgentIntegration: "workspace.inspectProjectAgentIntegration",
  installProjectAgentIntegration: "workspace.installProjectAgentIntegration",
  removeProjectAgentIntegration: "workspace.removeProjectAgentIntegration",
  previewAttachment: "thread.previewAttachment",
  getTurnDiff: "thread.getTurnDiff",
  getConfig: "server.getConfig",
  getSettings: "server.getSettings",
  patchSettings: "server.patchSettings",
  getKeybindings: "server.getKeybindings",
  replaceKeybindings: "server.replaceKeybindings",
  probe: "server.probe",
  searchWorkspacePaths: "workspace.searchPaths",
  vcsStatus: "vcs.status",
  subscribeVcsStatus: "vcs.subscribeStatus",
  vcsListRefs: "vcs.listRefs",
  vcsSwitchRef: "vcs.switchRef",
  vcsCreateRef: "vcs.createRef",
  vcsCreateWorktree: "vcs.createWorktree",
  gitDraft: "git.draft",
  gitRunStackedAction: "git.runStackedAction",
  gitGithubAccount: "git.githubAccount",
  gitGetPullRequest: "git.getPullRequest",
  gitPublishRepository: "git.publishRepository",
  listEditors: "workspace.listEditors",
  openInEditor: "workspace.openInEditor",
} as const

/**
 * Authentifie une connexion au control plane et fournit l'acteur vérifié aux
 * handlers. Le client ne choisit jamais l'identité dans le payload métier.
 * Le bearer de lancement accorde tous les scopes locaux.
 */
export class NoyauRpcIdentity extends RpcMiddleware.Service<
  NoyauRpcIdentity,
  { provides: CurrentActor }
>()("@noyau/contracts/rpc/NoyauRpcIdentity", {
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

export const ThreadStreamItem = Schema.Union([
  streamFrame(ThreadSnapshot, EventEnvelope),
  Schema.Struct({
    kind: Schema.Literal("live"),
    live: ThreadAssistantLive,
  }),
])
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

export const GetSettings = Rpc.make(RPC_METHODS.getSettings, {
  payload: Schema.Struct({}),
  success: ServerSettings,
  error: Schema.Union([ServerSettingsError, ServiceUnavailable]),
})

export const PatchSettings = Rpc.make(RPC_METHODS.patchSettings, {
  payload: ServerSettingsPatch,
  success: ServerSettings,
  error: Schema.Union([ServerSettingsError, ServiceUnavailable]),
})

export const GetKeybindings = Rpc.make(RPC_METHODS.getKeybindings, {
  payload: Schema.Struct({}),
  success: KeybindingsSnapshot,
  error: Schema.Union([KeybindingsError, ServiceUnavailable]),
})

export const ReplaceKeybindings = Rpc.make(RPC_METHODS.replaceKeybindings, {
  payload: KeybindingsSnapshot,
  success: KeybindingsSnapshot,
  error: Schema.Union([KeybindingsError, ServiceUnavailable]),
})

export const SearchWorkspacePathsInput = Schema.Struct({
  projectId: ProjectId,
  query: Schema.String,
})
export type SearchWorkspacePathsInput = (typeof SearchWorkspacePathsInput)["Type"]

export const SearchWorkspacePaths = Rpc.make(RPC_METHODS.searchWorkspacePaths, {
  payload: SearchWorkspacePathsInput,
  success: WorkspacePathSearchResult,
  error: Schema.Union([ServiceUnavailable, ProjectNotFound, ProjectUnavailable]),
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

const previewMutationErrors = Schema.Union([
  PreviewUrlInvalid,
  PreviewTabNotFound,
  ServiceUnavailable,
])

export const PreviewOpen = Rpc.make(RPC_METHODS.previewOpen, {
  payload: PreviewOpenInput,
  success: PreviewSessionSnapshot,
  error: Schema.Union([PreviewUrlInvalid, ServiceUnavailable]),
})

export const PreviewNavigate = Rpc.make(RPC_METHODS.previewNavigate, {
  payload: PreviewNavigateInput,
  success: PreviewSessionSnapshot,
  error: previewMutationErrors,
})

export const PreviewList = Rpc.make(RPC_METHODS.previewList, {
  payload: PreviewListInput,
  success: PreviewListResult,
  error: ServiceUnavailable,
})

export const PreviewClose = Rpc.make(RPC_METHODS.previewClose, {
  payload: PreviewCloseInput,
  success: PreviewCloseResult,
  error: Schema.Union([PreviewTabNotFound, ServiceUnavailable]),
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

export const GetTurnDiff = Rpc.make(RPC_METHODS.getTurnDiff, {
  payload: GetTurnDiffInput,
  success: TurnDiffPatch,
  error: Schema.Union([TurnDiffUnavailable, GitCommandError, ServiceUnavailable]),
})

export const VcsStatus = Rpc.make(RPC_METHODS.vcsStatus, {
  payload: VcsScope,
  success: VcsStatusResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const SubscribeVcsStatus = Rpc.make(RPC_METHODS.subscribeVcsStatus, {
  payload: VcsScope,
  success: VcsStatusStreamEvent,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
  stream: true,
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

export const GitGithubAccount = Rpc.make(RPC_METHODS.gitGithubAccount, {
  payload: VcsScope,
  success: GitHubAccountResult,
  error: ServiceUnavailable,
})

export const GitGetPullRequest = Rpc.make(RPC_METHODS.gitGetPullRequest, {
  payload: GitGetPullRequestInput,
  success: GitPullRequest,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const GitPublishRepository = Rpc.make(RPC_METHODS.gitPublishRepository, {
  payload: GitPublishRepositoryInput,
  success: GitPublishRepositoryResult,
  error: Schema.Union([GitCommandError, ServiceUnavailable]),
})

export const ListEditors = Rpc.make(RPC_METHODS.listEditors, {
  payload: Schema.Struct({}),
  success: ListEditorsResult,
  error: ServiceUnavailable,
})

export const OpenInEditor = Rpc.make(RPC_METHODS.openInEditor, {
  payload: OpenInEditorInput,
  success: OpenInEditorResult,
  error: Schema.Union([OpenInEditorFailed, ServiceUnavailable]),
})

/** Contrat unique client/serveur du control plane sur WebSocket. */
export const ControlPlaneRpcs = RpcGroup.make(
  DispatchCommand,
  GetConfig,
  GetSettings,
  PatchSettings,
  GetKeybindings,
  ReplaceKeybindings,
  Probe,
  SearchWorkspacePaths,
  SubscribeShell,
  SubscribeProject,
  SubscribeThread,
  SetShellFocus,
  PreviewFile,
  PreviewOpen,
  PreviewNavigate,
  PreviewList,
  PreviewClose,
  InspectProjectAgentIntegration,
  InstallProjectAgentIntegration,
  RemoveProjectAgentIntegration,
  PreviewAttachment,
  GetTurnDiff,
  VcsStatus,
  SubscribeVcsStatus,
  VcsListRefs,
  VcsSwitchRef,
  VcsCreateRef,
  VcsCreateWorktree,
  GitDraft,
  GitRunStackedAction,
  GitGithubAccount,
  GitGetPullRequest,
  GitPublishRepository,
  ListEditors,
  OpenInEditor,
).middleware(NoyauRpcIdentity)

export type ControlPlaneRpcs = typeof ControlPlaneRpcs
