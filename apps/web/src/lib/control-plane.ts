import type {
  ProjectAgentIntegration,
  ProjectAgentIntegrationInput,
} from "@noyau/protocol/agent-integration"
import type { AttachmentPreview, PreviewAttachmentInput } from "@noyau/protocol/attachment-preview"
import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ClientCommandRequest } from "@noyau/protocol/commands"
import type {
  ListEditorsResult,
  OpenInEditorInput,
  OpenInEditorResult,
} from "@noyau/protocol/editor"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { WorkspacePathSearchResult } from "@noyau/protocol/entities/workspace-path"
import type { Forbidden, MissingIdentity, ServiceUnavailable } from "@noyau/protocol/errors"
import type { EventEnvelope } from "@noyau/protocol/events"
import type { FilePreview, PreviewFileInput } from "@noyau/protocol/file-preview"
import type {
  GitDraftInput,
  GitDraftResult,
  GitHubAccountResult,
  GitPublishRepositoryInput,
  GitPublishRepositoryResult,
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
import type { ProjectId, Sequence } from "@noyau/protocol/ids"
import type { DispatchResult } from "@noyau/protocol/receipts"
import {
  ControlPlaneRpcs,
  RPC_METHODS,
  type ProjectStreamItem,
  type ShellStreamItem,
  type ThreadStreamItem,
} from "@noyau/protocol/rpc"
import type { SetShellFocusInput, ShellLiveEvent, ShellSnapshot } from "@noyau/protocol/shell"
import type { Cause } from "effect"
import { Context, Crypto, Effect, Exit, Fiber, Layer, ManagedRuntime, Option, Stream } from "effect"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError"
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup"
import { Socket } from "effect/unstable/socket"

import {
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
  return disposal
}

type ControlPlaneStreamError = RpcClientError | Forbidden | MissingIdentity | ServiceUnavailable

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
): Promise<ControlPlaneResult<WorkspacePathSearchResult>> =>
  runOperation(searchPaths(projectId, query), "snapshot")

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

export const gitPublishRepository = (
  input: GitPublishRepositoryInput,
): Promise<ControlPlaneResult<GitPublishRepositoryResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.gitPublishRepository](input)
    }),
  )

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
  readonly onEvent: (event: Event) => void
  readonly onStatus: (status: SubscriptionStatus) => void
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
      if (item.kind === "event" && !acceptsLiveEvents) {
        return
      }
      const sequence =
        item.kind === "snapshot" ? item.snapshot.snapshotSequence : item.event.sequence
      if (!acceptsSequence(lastSequence, sequence)) {
        return
      }
      lastSequence = sequence
      if (item.kind === "snapshot") {
        acceptsLiveEvents = true
        callbacks.onSnapshot(item.snapshot)
      } else {
        callbacks.onEvent(item.event)
      }
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
}

export const superviseSubscription = <Session>({
  afterSequence,
  currentSession,
  startAttempt,
  replaceSession,
  onStatus,
  schedule = scheduleReconnect,
}: SubscriptionSupervisorOptions<Session>): (() => void) => {
  let stopped = false
  let retrying = false
  let attempt = 0
  let stopAttempt: (() => void) | undefined
  let cancelReconnect: (() => void) | undefined

  const connect = (): void => {
    if (stopped) {
      return
    }
    const session = currentSession()
    stopAttempt = startAttempt(session, afterSequence(), (failure) => {
      if (stopped || retrying) {
        return
      }
      retrying = true
      attempt += 1
      stopAttempt?.()
      stopAttempt = undefined
      onStatus({ _tag: "Reconnecting", attempt, failure })
      void replaceSession(session).then(() => {
        if (stopped) {
          return
        }
        cancelReconnect = schedule(() => {
          cancelReconnect = undefined
          retrying = false
          connect()
        }, attempt)
        return undefined
      })
    })
  }

  connect()
  return () => {
    stopped = true
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
  const consumer = makeSequencedFrameConsumer(afterSequence, callbacks)
  return superviseSubscription({
    afterSequence: consumer.afterSequence,
    currentSession: () => activeTransportSession,
    replaceSession: replaceTransportSession,
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
) => stream.pipe(Stream.runForEach((item) => Effect.sync(() => consumer.consume(item))))

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
        )
      })
      return startSubscriptionAttempt(session, stream, onFailure)
    },
  })
}
