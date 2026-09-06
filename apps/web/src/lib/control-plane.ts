import type {
  ProjectAgentIntegration,
  ProjectAgentIntegrationInput,
} from "@noyau/contracts/agent-integration"
import type { AttachmentPreview, PreviewAttachmentInput } from "@noyau/contracts/attachment-preview"
import type { BoardSnapshot } from "@noyau/contracts/board"
import type { ClientCommandRequest } from "@noyau/contracts/commands"
import type {
  ListEditorsResult,
  OpenInEditorInput,
  OpenInEditorResult,
} from "@noyau/contracts/editor"
import type { AgentSkillCatalog } from "@noyau/contracts/entities/agent-skill"
import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { WorkspacePathSearchResult } from "@noyau/contracts/entities/workspace-path"
import type { Forbidden, MissingIdentity, ServiceUnavailable } from "@noyau/contracts/errors"
import type { EventEnvelope } from "@noyau/contracts/events"
import type { FilePreview, PreviewFileInput } from "@noyau/contracts/file-preview"
import type {
  GitDraftInput,
  GitDraftResult,
  GitGetPullRequestInput,
  GitHubAccountResult,
  GitPullRequest,
  GitPublishRepositoryInput,
  GitPublishRepositoryResult,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  GitSubmitPullRequestReviewInput,
  GitSubmitPullRequestReviewResult,
  VcsCreateRefInput,
  VcsCreateRefResult,
  VcsCreateWorktreeInput,
  VcsCreateWorktreeResult,
  VcsListRefsResult,
  GitCommandError,
  VcsScope,
  VcsStatusResult,
  VcsStatusStreamEvent,
  VcsSwitchRefInput,
  VcsSwitchRefResult,
} from "@noyau/contracts/git"
import type { ProjectId, Sequence } from "@noyau/contracts/ids"
import type { KeybindingsSnapshot } from "@noyau/contracts/keybindings"
import type {
  PreviewCloseInput,
  PreviewCloseResult,
  PreviewListInput,
  PreviewListResult,
  PreviewNavigateInput,
  PreviewOpenInput,
  PreviewSessionSnapshot,
} from "@noyau/contracts/preview"
import type { DispatchResult } from "@noyau/contracts/receipts"
import {
  ControlPlaneRpcs,
  RPC_METHODS,
  type ListAgentSkillsInput,
  type ProjectStreamItem,
  type ShellStreamItem,
  type ThreadStreamItem,
} from "@noyau/contracts/rpc"
import type { ServerSettings, ServerSettingsPatch } from "@noyau/contracts/settings"
import {
  isShellSideChannelEvent,
  type SetShellFocusInput,
  type ShellLiveEvent,
  type ShellSnapshot,
} from "@noyau/contracts/shell"
import type { ThreadAssistantLive } from "@noyau/contracts/thread/live"
import type { GetTurnDiffInput, TurnDiffPatch } from "@noyau/contracts/turn-diff"
import type { Cause } from "effect"
import { Context, Crypto, Effect, Exit, Fiber, Layer, ManagedRuntime, Option, Stream } from "effect"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError"
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup"
import { Socket } from "effect/unstable/socket"

import {
  isTransportReplacementFailure,
  normalizeCause,
  ResourceSnapshotUnavailable,
  subscriptionEnded,
  technicalFailureDetails,
  type AppFailure,
  type FailurePhase,
} from "./app-failure"
import { controlPlaneConfig, type ControlPlaneConfig } from "./control-plane-config"

export type ControlPlaneResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly failure: AppFailure }

export type SubscriptionStatus =
  | { readonly _tag: "Connected" }
  | { readonly _tag: "Reconnecting"; readonly attempt: number; readonly failure: AppFailure }

class ControlPlaneClient extends Context.Service<
  ControlPlaneClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof ControlPlaneRpcs>, RpcClientError>
>()("@noyau/web/ControlPlaneClient") {
  static layer(config: ControlPlaneConfig) {
    const rpcUrl = new URL(config.rpcUrl)
    rpcUrl.searchParams.set("token", config.bearerToken)
    const socketLayer = Layer.effect(Socket.Socket, Socket.makeWebSocket(rpcUrl.toString())).pipe(
      Layer.provide(Socket.layerWebSocketConstructorGlobal),
    )

    return Layer.effect(ControlPlaneClient, RpcClient.make(ControlPlaneRpcs)).pipe(
      Layer.provide(RpcClient.layerProtocolSocket({ retryTransientErrors: true })),
      Layer.provide(socketLayer),
      Layer.provide(RpcSerialization.layerJson),
    )
  }
}

const browserCrypto = Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) => {
    const input = new Uint8Array(data)
    return Effect.promise(() =>
      globalThis.crypto.subtle.digest(algorithm, input).then((digest) => new Uint8Array(digest)),
    )
  },
})

const makeTransportSession = () =>
  ManagedRuntime.make(
    Layer.merge(
      ControlPlaneClient.layer(controlPlaneConfig),
      Layer.succeed(Crypto.Crypto)(browserCrypto),
    ),
  )

type TransportSession = ReturnType<typeof makeTransportSession>

let activeTransportSession = makeTransportSession()
const retiredSessions = new WeakMap<TransportSession, Promise<void>>()
const sessionReplacementListeners = new Set<() => void>()

const watchTransportSessionReplacement = (reconnect: () => void): (() => void) => {
  sessionReplacementListeners.add(reconnect)
  return () => {
    sessionReplacementListeners.delete(reconnect)
  }
}

const replaceTransportSession = (failedSession: TransportSession): Promise<void> => {
  const retired = retiredSessions.get(failedSession)
  if (retired !== undefined) {
    return retired
  }
  if (activeTransportSession !== failedSession) {
    return Promise.resolve()
  }
  activeTransportSession = makeTransportSession()
  const disposal = failedSession.dispose()
  retiredSessions.set(failedSession, disposal)
  for (const reconnect of sessionReplacementListeners) {
    reconnect()
  }
  return disposal
}

export const shouldRetryVcsStatus = (failure: AppFailure): boolean =>
  isTransportReplacementFailure(failure) || failure._tag === "Unavailable"

type ControlPlaneStreamError =
  | RpcClientError
  | Forbidden
  | MissingIdentity
  | ServiceUnavailable
  | GitCommandError

const reportTechnicalFailure = <E>(cause: Cause.Cause<E>, failure: AppFailure) => {
  if (failure._tag === "UnexpectedFailure") {
    Effect.runFork(
      Effect.logError(technicalFailureDetails(cause)).pipe(
        Effect.annotateLogs({ incidentId: failure.incidentId, source: "control-plane" }),
      ),
    )
  }
}

const matchOperationExit = <A>(
  exit: Exit.Exit<A, unknown>,
  phase: FailurePhase,
): ControlPlaneResult<A> =>
  Exit.match(exit, {
    onFailure: (cause) => {
      const failure = normalizeCause(cause, phase)
      reportTechnicalFailure(cause, failure)
      return { ok: false, failure }
    },
    onSuccess: (value) => ({ ok: true, value }),
  })

const runOperation = <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient>,
  phase: FailurePhase,
): Promise<ControlPlaneResult<A>> =>
  activeTransportSession.runPromiseExit(operation).then((exit) => matchOperationExit(exit, phase))

const runOperationWithCrypto = <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient | Crypto.Crypto>,
  phase: FailurePhase,
): Promise<ControlPlaneResult<A>> =>
  activeTransportSession.runPromiseExit(operation).then((exit) => matchOperationExit(exit, phase))

const dispatch = Effect.fn("ControlPlaneClient.dispatchCommand")(function* (
  request: ClientCommandRequest,
) {
  yield* Effect.annotateCurrentSpan({
    "noyau.command_id": request.commandId,
    "noyau.command_type": request._tag,
  })
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.dispatchCommand](request)
})

const getProjectSnapshot = Effect.fn("ControlPlaneClient.getProjectSnapshot")(function* (
  projectId: ProjectId,
) {
  const client = yield* ControlPlaneClient
  const item = yield* client[RPC_METHODS.subscribeProject]({ projectId }).pipe(
    Stream.filter(
      (frame): frame is Extract<ProjectStreamItem, { readonly kind: "snapshot" }> =>
        frame.kind === "snapshot",
    ),
    Stream.runHead,
  )
  if (Option.isNone(item)) {
    return yield* new ResourceSnapshotUnavailable({ resource: "project" })
  }
  return item.value.snapshot
})

export const loadBoardSnapshot = (
  projectId: ProjectId,
): Promise<ControlPlaneResult<BoardSnapshot>> =>
  runOperation(getProjectSnapshot(projectId), "snapshot")

const getThreadSnapshot = Effect.fn("ControlPlaneClient.getThreadSnapshot")(function* (
  threadId: ThreadSnapshot["thread"]["id"],
) {
  const client = yield* ControlPlaneClient
  const item = yield* client[RPC_METHODS.subscribeThread]({ threadId }).pipe(
    Stream.filter(
      (frame): frame is Extract<ThreadStreamItem, { readonly kind: "snapshot" }> =>
        frame.kind === "snapshot",
    ),
    Stream.runHead,
  )
  if (Option.isNone(item)) {
    return yield* new ResourceSnapshotUnavailable({ resource: "thread" })
  }
  return item.value.snapshot
})

export const loadThreadSnapshot = (
  threadId: ThreadSnapshot["thread"]["id"],
): Promise<ControlPlaneResult<ThreadSnapshot>> =>
  runOperation(getThreadSnapshot(threadId), "snapshot")

export const dispatchCommand = (
  request: ClientCommandRequest,
): Promise<ControlPlaneResult<DispatchResult>> => runOperation(dispatch(request), "command")

const reportShellFocus = Effect.fn("ControlPlaneClient.setShellFocus")(function* (
  input: SetShellFocusInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.setShellFocus](input)
})

export const setShellFocus = (
  input: SetShellFocusInput,
): Promise<ControlPlaneResult<Record<never, never>>> =>
  runOperation(reportShellFocus(input), "command")

const requestPreviewFile = Effect.fn("ControlPlaneClient.previewFile")(function* (
  input: PreviewFileInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.previewFile](input)
})

export const previewFile = (input: PreviewFileInput): Promise<ControlPlaneResult<FilePreview>> =>
  runOperation(requestPreviewFile(input), "command")

const requestPreviewOpen = Effect.fn("ControlPlaneClient.previewOpen")(function* (
  input: PreviewOpenInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.previewOpen](input)
})

export const previewOpen = (
  input: PreviewOpenInput,
): Promise<ControlPlaneResult<PreviewSessionSnapshot>> =>
  runOperation(requestPreviewOpen(input), "command")

const requestPreviewNavigate = Effect.fn("ControlPlaneClient.previewNavigate")(function* (
  input: PreviewNavigateInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.previewNavigate](input)
})

export const previewNavigate = (
  input: PreviewNavigateInput,
): Promise<ControlPlaneResult<PreviewSessionSnapshot>> =>
  runOperation(requestPreviewNavigate(input), "command")

const requestPreviewList = Effect.fn("ControlPlaneClient.previewList")(function* (
  input: PreviewListInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.previewList](input)
})

export const previewList = (
  input: PreviewListInput,
): Promise<ControlPlaneResult<PreviewListResult>> =>
  runOperation(requestPreviewList(input), "command")

const requestPreviewClose = Effect.fn("ControlPlaneClient.previewClose")(function* (
  input: PreviewCloseInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.previewClose](input)
})

export const previewClose = (
  input: PreviewCloseInput,
): Promise<ControlPlaneResult<PreviewCloseResult>> =>
  runOperation(requestPreviewClose(input), "command")

const requestGetTurnDiff = Effect.fn("ControlPlaneClient.getTurnDiff")(function* (
  input: GetTurnDiffInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.getTurnDiff](input)
})

export const getTurnDiff = (input: GetTurnDiffInput): Promise<ControlPlaneResult<TurnDiffPatch>> =>
  runOperation(requestGetTurnDiff(input), "command")

const searchPaths = Effect.fn("ControlPlaneClient.searchWorkspacePaths")(function* (
  projectId: ProjectId,
  query: string,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.searchWorkspacePaths]({ projectId, query })
})

export const searchWorkspacePaths = (
  projectId: ProjectId,
  query: string,
  signal?: AbortSignal,
): Promise<ControlPlaneResult<WorkspacePathSearchResult>> =>
  activeTransportSession
    .runPromiseExit(searchPaths(projectId, query), { signal })
    .then((exit) => matchOperationExit(exit, "snapshot"))

const requestAgentSkills = Effect.fn("ControlPlaneClient.listAgentSkills")(function* (
  input: ListAgentSkillsInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.listAgentSkills](input)
})

export const listAgentSkills = (
  input: ListAgentSkillsInput,
): Promise<ControlPlaneResult<AgentSkillCatalog>> =>
  runOperation(requestAgentSkills(input), "snapshot")

const requestAgentIntegration = Effect.fn("ControlPlaneClient.projectAgentIntegration")(function* (
  method:
    | typeof RPC_METHODS.inspectProjectAgentIntegration
    | typeof RPC_METHODS.installProjectAgentIntegration
    | typeof RPC_METHODS.removeProjectAgentIntegration,
  input: ProjectAgentIntegrationInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[method](input)
})

export const inspectProjectAgentIntegration = (
  input: ProjectAgentIntegrationInput,
): Promise<ControlPlaneResult<ProjectAgentIntegration>> =>
  runOperation(
    requestAgentIntegration(RPC_METHODS.inspectProjectAgentIntegration, input),
    "command",
  )

export const installProjectAgentIntegration = (
  input: ProjectAgentIntegrationInput,
): Promise<ControlPlaneResult<ProjectAgentIntegration>> =>
  runOperation(
    requestAgentIntegration(RPC_METHODS.installProjectAgentIntegration, input),
    "command",
  )

export const removeProjectAgentIntegration = (
  input: ProjectAgentIntegrationInput,
): Promise<ControlPlaneResult<ProjectAgentIntegration>> =>
  runOperation(requestAgentIntegration(RPC_METHODS.removeProjectAgentIntegration, input), "command")

const requestPreviewAttachment = Effect.fn("ControlPlaneClient.previewAttachment")(function* (
  input: PreviewAttachmentInput,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.previewAttachment](input)
})

export const previewAttachment = (
  input: PreviewAttachmentInput,
): Promise<ControlPlaneResult<AttachmentPreview>> =>
  runOperation(requestPreviewAttachment(input), "command")

const gitCall = <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient>,
): Promise<ControlPlaneResult<A>> => runOperation(operation, "command")

export const vcsStatus = (input: VcsScope): Promise<ControlPlaneResult<VcsStatusResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.vcsStatus](input)
    }),
  )

export const vcsListRefs = (input: VcsScope): Promise<ControlPlaneResult<VcsListRefsResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.vcsListRefs](input)
    }),
  )

export const vcsSwitchRef = (
  input: VcsSwitchRefInput,
): Promise<ControlPlaneResult<VcsSwitchRefResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.vcsSwitchRef](input)
    }),
  )

export const vcsCreateRef = (
  input: VcsCreateRefInput,
): Promise<ControlPlaneResult<VcsCreateRefResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.vcsCreateRef](input)
    }),
  )

export const vcsCreateWorktree = (
  input: VcsCreateWorktreeInput,
): Promise<ControlPlaneResult<VcsCreateWorktreeResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.vcsCreateWorktree](input)
    }),
  )

export const gitDraft = (input: GitDraftInput): Promise<ControlPlaneResult<GitDraftResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.gitDraft](input)
    }),
  )

export const gitRunStackedAction = (
  input: GitRunStackedActionInput,
): Promise<ControlPlaneResult<GitRunStackedActionResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.gitRunStackedAction](input)
    }),
  )

export const gitGithubAccount = (
  input: VcsScope,
): Promise<ControlPlaneResult<GitHubAccountResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.gitGithubAccount](input)
    }),
  )

export const gitGetPullRequest = (
  input: GitGetPullRequestInput,
): Promise<ControlPlaneResult<GitPullRequest>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.gitGetPullRequest](input)
    }),
  )

export const gitSubmitPullRequestReview = (
  input: GitSubmitPullRequestReviewInput,
): Promise<ControlPlaneResult<GitSubmitPullRequestReviewResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.gitSubmitPullRequestReview](input)
    }),
  )

export const gitPublishRepository = (
  input: GitPublishRepositoryInput,
): Promise<ControlPlaneResult<GitPublishRepositoryResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.gitPublishRepository](input)
    }),
  )

const requestSettings = Effect.fn("ControlPlaneClient.getSettings")(function* () {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.getSettings]({})
})

export const getSettings = (): Promise<ControlPlaneResult<ServerSettings>> =>
  runOperation(requestSettings(), "command")

const requestPatchSettings = Effect.fn("ControlPlaneClient.patchSettings")(function* (
  patch: ServerSettingsPatch,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.patchSettings](patch)
})

export const patchSettings = (
  patch: ServerSettingsPatch,
): Promise<ControlPlaneResult<ServerSettings>> =>
  runOperation(requestPatchSettings(patch), "command")

const requestKeybindings = Effect.fn("ControlPlaneClient.getKeybindings")(function* () {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.getKeybindings]({})
})

export const getKeybindings = (): Promise<ControlPlaneResult<KeybindingsSnapshot>> =>
  runOperation(requestKeybindings(), "command")

const requestReplaceKeybindings = Effect.fn("ControlPlaneClient.replaceKeybindings")(function* (
  snapshot: KeybindingsSnapshot,
) {
  const client = yield* ControlPlaneClient
  return yield* client[RPC_METHODS.replaceKeybindings](snapshot)
})

export const replaceKeybindings = (
  snapshot: KeybindingsSnapshot,
): Promise<ControlPlaneResult<KeybindingsSnapshot>> =>
  runOperation(requestReplaceKeybindings(snapshot), "command")

export const listEditors = (): Promise<ControlPlaneResult<ListEditorsResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.listEditors]({})
    }),
  )

export const openInEditor = (
  input: OpenInEditorInput,
): Promise<ControlPlaneResult<OpenInEditorResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.openInEditor](input)
    }),
  )

export const buildAndDispatchCommand = <A extends ClientCommandRequest, E>(
  request: Effect.Effect<A, E, Crypto.Crypto>,
): Promise<ControlPlaneResult<DispatchResult>> =>
  runOperationWithCrypto(request, "input").then((built) =>
    built.ok ? dispatchCommand(built.value) : built,
  )

export const buildCommand = <A, E>(
  request: Effect.Effect<A, E, Crypto.Crypto>,
): Promise<ControlPlaneResult<A>> => runOperationWithCrypto(request, "input")

type StreamCallbacks<Snapshot, Event> = {
  readonly onSnapshot: (snapshot: Snapshot) => void
  /** Return `false` to refuse the event and keep the stream cursor unmoved. */
  readonly onEvent: (event: Event) => boolean | void
  readonly onStatus: (status: SubscriptionStatus) => void
  readonly onLive?: (live: ThreadAssistantLive) => void
}

type SequencedSnapshot = { readonly snapshotSequence: Sequence }
type SequencedEvent = { readonly sequence: Sequence }
type SequencedFrame<Snapshot extends SequencedSnapshot, Event extends SequencedEvent> =
  | { readonly kind: "snapshot"; readonly snapshot: Snapshot }
  | { readonly kind: "event"; readonly event: Event }
  | { readonly kind: "synchronized" }

export const makeSequencedFrameConsumer = <
  Snapshot extends SequencedSnapshot,
  Event extends SequencedEvent,
>(
  initialAfterSequence: Sequence | undefined,
  callbacks: StreamCallbacks<Snapshot, Event>,
  options?: {
    readonly isSideChannel?: (event: Event) => boolean
  },
) => {
  let lastSequence = initialAfterSequence
  let acceptsLiveEvents = initialAfterSequence !== undefined

  return {
    afterSequence: () => lastSequence,
    consume: (item: SequencedFrame<Snapshot, Event>): void => {
      callbacks.onStatus({ _tag: "Connected" })
      if (item.kind === "synchronized") {
        return
      }
      if (item.kind === "event" && options?.isSideChannel?.(item.event)) {
        if (!acceptsLiveEvents) {
          return
        }
        callbacks.onEvent(item.event)
        return
      }
      if (item.kind === "event" && !acceptsLiveEvents) {
        return
      }
      const sequence =
        item.kind === "snapshot" ? item.snapshot.snapshotSequence : item.event.sequence
      if (!acceptsSequence(lastSequence, sequence)) {
        return
      }
      if (item.kind === "snapshot") {
        lastSequence = sequence
        acceptsLiveEvents = true
        callbacks.onSnapshot(item.snapshot)
        return
      }
      if (callbacks.onEvent(item.event) === false) {
        return
      }
      lastSequence = sequence
    },
  }
}

type ReconnectSchedule = (reconnect: () => void, attempt: number) => () => void

const scheduleReconnect: ReconnectSchedule = (reconnect, attempt) => {
  const delay = Math.min(100 * 2 ** Math.max(0, attempt - 1), 2_000)
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      yield* Effect.sleep(delay)
      reconnect()
    }),
  )
  return () => {
    Effect.runFork(Fiber.interrupt(fiber))
  }
}

export interface SubscriptionSupervisorOptions<Session> {
  readonly afterSequence: () => Sequence | undefined
  readonly currentSession: () => Session
  readonly startAttempt: (
    session: Session,
    afterSequence: Sequence | undefined,
    onFailure: (failure: AppFailure) => void,
  ) => () => void
  readonly replaceSession: (failedSession: Session) => Promise<void>
  readonly onStatus: (status: SubscriptionStatus) => void
  readonly schedule?: ReconnectSchedule
  readonly shouldReplaceSession?: (failure: AppFailure) => boolean
  readonly shouldRetry?: (failure: AppFailure) => boolean
  readonly watchSessionReplacement?: (reconnect: () => void) => () => void
}

export const superviseSubscription = <Session>({
  afterSequence,
  currentSession,
  startAttempt,
  replaceSession,
  onStatus,
  schedule = scheduleReconnect,
  shouldReplaceSession = isTransportReplacementFailure,
  shouldRetry = () => true,
  watchSessionReplacement,
}: SubscriptionSupervisorOptions<Session>): (() => void) => {
  let stopped = false
  let retrying = false
  let attempt = 0
  let stopAttempt: (() => void) | undefined
  let cancelReconnect: (() => void) | undefined

  const scheduleConnect = (): void => {
    cancelReconnect = schedule(() => {
      cancelReconnect = undefined
      retrying = false
      connect()
    }, attempt)
  }

  const beginReconnect = (failure: AppFailure): void => {
    retrying = true
    attempt += 1
    stopAttempt?.()
    stopAttempt = undefined
    cancelReconnect?.()
    cancelReconnect = undefined
    onStatus({ _tag: "Reconnecting", attempt, failure })
  }

  const handleFailure = (session: Session, failure: AppFailure): void => {
    if (stopped || retrying || failure._tag === "Interrupted") {
      return
    }
    const replace = shouldReplaceSession(failure)
    if (!replace && !shouldRetry(failure)) {
      return
    }
    beginReconnect(failure)
    if (replace) {
      void replaceSession(session).then(() => {
        if (!stopped) {
          scheduleConnect()
        }
        return undefined
      })
      return
    }
    scheduleConnect()
  }

  const connect = (): void => {
    if (stopped) {
      return
    }
    const session = currentSession()
    stopAttempt = startAttempt(session, afterSequence(), (failure) => {
      handleFailure(session, failure)
    })
  }

  const forceReconnect = (): void => {
    if (stopped || retrying) {
      return
    }
    beginReconnect(subscriptionEnded())
    scheduleConnect()
  }

  const unwatch = watchSessionReplacement?.(forceReconnect)

  connect()
  return () => {
    stopped = true
    unwatch?.()
    cancelReconnect?.()
    stopAttempt?.()
  }
}

const startSubscriptionAttempt = (
  session: TransportSession,
  stream: Effect.Effect<void, ControlPlaneStreamError, ControlPlaneClient>,
  onFailure: (failure: AppFailure) => void,
) => {
  const fiber = session.runFork(
    stream.pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => {
          const failure = normalizeCause(cause, "stream")
          reportTechnicalFailure(cause, failure)
          return Effect.sync(() => onFailure(failure))
        },
        onSuccess: () => Effect.sync(() => onFailure(subscriptionEnded())),
      }),
    ),
  )
  return () => {
    session.runFork(Fiber.interrupt(fiber))
  }
}

export const acceptsSequence = (
  lastSequence: Sequence | undefined,
  nextSequence: Sequence,
): boolean => lastSequence === undefined || nextSequence > lastSequence

const consumeShellStream = (
  stream: Stream.Stream<ShellStreamItem, ControlPlaneStreamError>,
  consumer: ReturnType<typeof makeSequencedFrameConsumer<ShellSnapshot, ShellLiveEvent>>,
) => stream.pipe(Stream.runForEach((item) => Effect.sync(() => consumer.consume(item))))

const consumeProjectStream = (
  stream: Stream.Stream<ProjectStreamItem, ControlPlaneStreamError>,
  consumer: ReturnType<typeof makeSequencedFrameConsumer<BoardSnapshot, EventEnvelope>>,
) => stream.pipe(Stream.runForEach((item) => Effect.sync(() => consumer.consume(item))))

export const subscribeShell = (
  afterSequence: Sequence | undefined,
  callbacks: StreamCallbacks<ShellSnapshot, ShellLiveEvent>,
) => {
  const consumer = makeSequencedFrameConsumer(afterSequence, callbacks, {
    isSideChannel: isShellSideChannelEvent,
  })
  return superviseSubscription({
    afterSequence: consumer.afterSequence,
    currentSession: () => activeTransportSession,
    replaceSession: replaceTransportSession,
    watchSessionReplacement: watchTransportSessionReplacement,
    onStatus: callbacks.onStatus,
    startAttempt: (session, resumeAfterSequence, onFailure) => {
      const stream = Effect.gen(function* () {
        const client = yield* ControlPlaneClient
        return yield* consumeShellStream(
          client[RPC_METHODS.subscribeShell](
            resumeAfterSequence === undefined ? {} : { afterSequence: resumeAfterSequence },
          ),
          consumer,
        )
      })
      return startSubscriptionAttempt(session, stream, onFailure)
    },
  })
}

export const subscribeProject = (
  projectId: ProjectId,
  afterSequence: Sequence | undefined,
  callbacks: StreamCallbacks<BoardSnapshot, EventEnvelope>,
) => {
  const consumer = makeSequencedFrameConsumer(afterSequence, callbacks)
  return superviseSubscription({
    afterSequence: consumer.afterSequence,
    currentSession: () => activeTransportSession,
    replaceSession: replaceTransportSession,
    watchSessionReplacement: watchTransportSessionReplacement,
    onStatus: callbacks.onStatus,
    startAttempt: (session, resumeAfterSequence, onFailure) => {
      const stream = Effect.gen(function* () {
        const client = yield* ControlPlaneClient
        return yield* consumeProjectStream(
          client[RPC_METHODS.subscribeProject](
            resumeAfterSequence === undefined
              ? { projectId }
              : { projectId, afterSequence: resumeAfterSequence },
          ),
          consumer,
        )
      })
      return startSubscriptionAttempt(session, stream, onFailure)
    },
  })
}

const consumeThreadStream = (
  stream: Stream.Stream<ThreadStreamItem, ControlPlaneStreamError>,
  consumer: ReturnType<typeof makeSequencedFrameConsumer<ThreadSnapshot, EventEnvelope>>,
  onLive?: (live: ThreadAssistantLive) => void,
) =>
  stream.pipe(
    Stream.runForEach((item) =>
      Effect.sync(() => {
        if (item.kind === "live") {
          onLive?.(item.live)
          return
        }
        consumer.consume(item)
      }),
    ),
  )

export const subscribeVcsStatus = (
  scope: VcsScope,
  onEvent: (event: VcsStatusStreamEvent) => void,
  onStatus: (status: SubscriptionStatus) => void = () => undefined,
) =>
  superviseSubscription({
    afterSequence: () => undefined,
    currentSession: () => activeTransportSession,
    replaceSession: replaceTransportSession,
    watchSessionReplacement: watchTransportSessionReplacement,
    shouldRetry: shouldRetryVcsStatus,
    onStatus,
    startAttempt: (session, _resumeAfterSequence, onFailure) => {
      const stream = Effect.gen(function* () {
        const client = yield* ControlPlaneClient
        return yield* client[RPC_METHODS.subscribeVcsStatus](scope).pipe(
          Stream.runForEach((event) => Effect.sync(() => onEvent(event))),
        )
      })
      return startSubscriptionAttempt(session, stream, onFailure)
    },
  })

export const subscribeThread = (
  threadId: ThreadSnapshot["thread"]["id"],
  afterSequence: Sequence | undefined,
  callbacks: StreamCallbacks<ThreadSnapshot, EventEnvelope>,
) => {
  const consumer = makeSequencedFrameConsumer(afterSequence, callbacks)
  return superviseSubscription({
    afterSequence: consumer.afterSequence,
    currentSession: () => activeTransportSession,
    replaceSession: replaceTransportSession,
    watchSessionReplacement: watchTransportSessionReplacement,
    onStatus: callbacks.onStatus,
    startAttempt: (session, resumeAfterSequence, onFailure) => {
      const stream = Effect.gen(function* () {
        const client = yield* ControlPlaneClient
        return yield* consumeThreadStream(
          client[RPC_METHODS.subscribeThread](
            resumeAfterSequence === undefined
              ? { threadId }
              : { threadId, afterSequence: resumeAfterSequence },
          ),
          consumer,
          callbacks.onLive,
        )
      })
      return startSubscriptionAttempt(session, stream, onFailure)
    },
  })
}
