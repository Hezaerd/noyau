import { ConnectionSupervisor, TransportRupture } from "@noyau/client-runtime/connection"
import { type RpcSession } from "@noyau/client-runtime/rpc"
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
  VcsRemoveWorktreeInput,
  VcsRemoveWorktreeResult,
  GitCommandError,
  VcsScope,
  VcsStatusResult,
  VcsStatusStreamEvent,
  VcsSwitchRefInput,
  VcsSwitchRefResult,
} from "@noyau/protocol/git"
import type { ProjectId, Sequence } from "@noyau/protocol/ids"
import type { DispatchResult } from "@noyau/protocol/receipts"
import type { ControlPlaneRpcs } from "@noyau/protocol/rpc"
import {
  RPC_METHODS,
  type ProjectStreamItem,
  type ShellStreamItem,
  type ThreadStreamItem,
} from "@noyau/protocol/rpc"
import type { SetShellFocusInput, ShellLiveEvent, ShellSnapshot } from "@noyau/protocol/shell"
import type { ThreadAssistantLive } from "@noyau/protocol/thread/live"
import type { GetTurnDiffInput, TurnDiffPatch } from "@noyau/protocol/turn-diff"
import type { Cause, Crypto } from "effect"
import { Context, Effect, Exit, Fiber, Option, Stream } from "effect"
import type { RpcClient } from "effect/unstable/rpc"
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError"
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup"

import { controlPlaneRuntime } from "@/client-runtime/runtime"

import {
  normalizeCause,
  ResourceSnapshotUnavailable,
  subscriptionEnded,
  technicalFailureDetails,
  type AppFailure,
  type FailurePhase,
} from "./app-failure"

export type ControlPlaneResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly failure: AppFailure }

export type SubscriptionStatus =
  | { readonly _tag: "Connected" }
  | { readonly _tag: "Reconnecting"; readonly attempt: number; readonly failure: AppFailure }
  | { readonly _tag: "Failed"; readonly failure: AppFailure }

class ControlPlaneClient extends Context.Service<
  ControlPlaneClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof ControlPlaneRpcs>, RpcClientError>
>()("@noyau/web/ControlPlaneClient") {}

const withSupervisor = <A, E, R = never>(
  use: (supervisor: ConnectionSupervisor["Service"]) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | ConnectionSupervisor> =>
  Effect.gen(function* () {
    const supervisor = yield* ConnectionSupervisor
    yield* supervisor.start
    return yield* use(supervisor)
  })

const waitCurrentSession = (): Promise<RpcSession> =>
  controlPlaneRuntime.runPromise(withSupervisor((supervisor) => supervisor.currentSession))

const notifySessionRupture = (session: RpcSession, failure: AppFailure): Promise<void> =>
  controlPlaneRuntime.runPromise(
    withSupervisor((supervisor) =>
      supervisor.notifyTransportRupture(
        session,
        new TransportRupture({
          reason: failure._tag === "TransportFailure" ? failure.reason : "failed",
        }),
      ),
    ),
  )

const isTransportSubscriptionFailure = (failure: AppFailure): boolean =>
  failure._tag === "TransportFailure"

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

const runOnCurrentSession = <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient | Crypto.Crypto>,
): Promise<Exit.Exit<A, E | TransportRupture>> =>
  controlPlaneRuntime.runPromiseExit(
    withSupervisor((supervisor) =>
      supervisor.currentSession.pipe(
        Effect.flatMap((session) =>
          operation.pipe(Effect.provideService(ControlPlaneClient, session.client)),
        ),
      ),
    ),
  )

const runOperation = <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient>,
  phase: FailurePhase,
): Promise<ControlPlaneResult<A>> =>
  runOnCurrentSession(operation).then((exit) => matchOperationExit(exit, phase))

const runOperationWithCrypto = <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient | Crypto.Crypto>,
  phase: FailurePhase,
): Promise<ControlPlaneResult<A>> =>
  runOnCurrentSession(operation).then((exit) => matchOperationExit(exit, phase))

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

export const vcsRemoveWorktree = (
  input: VcsRemoveWorktreeInput,
): Promise<ControlPlaneResult<VcsRemoveWorktreeResult>> =>
  gitCall(
    Effect.gen(function* () {
      const client = yield* ControlPlaneClient
      return yield* client[RPC_METHODS.vcsRemoveWorktree](input)
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
  readonly currentSession: () => Session | Promise<Session>
  readonly startAttempt: (
    session: Session,
    afterSequence: Sequence | undefined,
    onFailure: (failure: AppFailure) => void,
  ) => () => void
  readonly replaceSession: (failedSession: Session, failure: AppFailure) => Promise<void>
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

  const beginAttempt = (session: Session): void => {
    if (stopped) {
      return
    }
    stopAttempt = startAttempt(session, afterSequence(), (failure) => {
      if (stopped || retrying) {
        return
      }
      if (failure._tag === "Interrupted") {
        return
      }
      if (!isTransportSubscriptionFailure(failure)) {
        onStatus({ _tag: "Failed", failure })
        return
      }
      retrying = true
      attempt += 1
      stopAttempt?.()
      stopAttempt = undefined
      onStatus({ _tag: "Reconnecting", attempt, failure })
      void replaceSession(session, failure).then(() => {
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

  const connect = (): void => {
    if (stopped) {
      return
    }
    const resolved = currentSession()
    if (resolved instanceof Promise) {
      void resolved.then(beginAttempt)
      return
    }
    beginAttempt(resolved)
  }

  connect()
  return () => {
    stopped = true
    cancelReconnect?.()
    stopAttempt?.()
  }
}

const startSubscriptionAttempt = (
  session: RpcSession,
  stream: Effect.Effect<void, ControlPlaneStreamError, ControlPlaneClient>,
  onFailure: (failure: AppFailure) => void,
) => {
  const fiber = Effect.runFork(
    stream.pipe(
      Effect.provideService(ControlPlaneClient, session.client),
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
    Effect.runFork(Fiber.interrupt(fiber))
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
    currentSession: waitCurrentSession,
    replaceSession: notifySessionRupture,
    schedule: (reconnect) => {
      reconnect()
      return () => undefined
    },
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
    currentSession: waitCurrentSession,
    replaceSession: notifySessionRupture,
    schedule: (reconnect) => {
      reconnect()
      return () => undefined
    },
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
    currentSession: waitCurrentSession,
    replaceSession: notifySessionRupture,
    schedule: (reconnect) => {
      reconnect()
      return () => undefined
    },
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
    currentSession: waitCurrentSession,
    replaceSession: notifySessionRupture,
    schedule: (reconnect) => {
      reconnect()
      return () => undefined
    },
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
