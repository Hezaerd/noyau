import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ClientCommandRequest } from "@noyau/protocol/commands"
import type { Forbidden, MissingIdentity, ServiceUnavailable } from "@noyau/protocol/errors"
import type { EventEnvelope } from "@noyau/protocol/events"
import type { ProjectId, Sequence } from "@noyau/protocol/ids"
import type { DispatchResult } from "@noyau/protocol/receipts"
import {
  ControlPlaneRpcs,
  RPC_METHODS,
  type ProjectStreamItem,
  type ShellStreamItem,
} from "@noyau/protocol/rpc"
import type { ShellLiveEvent, ShellSnapshot } from "@noyau/protocol/shell"
import {
  Cause,
  Context,
  Crypto,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  Schema,
  Stream,
} from "effect"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError"
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup"
import { Socket } from "effect/unstable/socket"

import { controlPlaneConfig, type ControlPlaneConfig } from "./control-plane-config"

export type ControlPlaneResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly details: string }

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
      Layer.provide(RpcClient.layerProtocolSocket()),
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

class ProjectSnapshotUnavailable extends Schema.TaggedError<ProjectSnapshotUnavailable>()(
  "ProjectSnapshotUnavailable",
  {
    message: Schema.NonEmptyString,
  },
) {}

const runOperation = async <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient>,
): Promise<ControlPlaneResult<A>> => {
  const exit = await activeTransportSession.runPromiseExit(operation)

  return Exit.match(exit, {
    onFailure: (cause) => ({ ok: false, details: Cause.pretty(cause) }),
    onSuccess: (value) => ({ ok: true, value }),
  })
}

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
    return yield* new ProjectSnapshotUnavailable({
      message: "Project subscription ended before its snapshot.",
    })
  }
  return item.value.snapshot
})

export const loadBoardSnapshot = (
  projectId: ProjectId,
): Promise<ControlPlaneResult<BoardSnapshot>> => runOperation(getProjectSnapshot(projectId))

export const dispatchCommand = (
  request: ClientCommandRequest,
): Promise<ControlPlaneResult<DispatchResult>> => runOperation(dispatch(request))

export const buildAndDispatchCommand = <A extends ClientCommandRequest, E>(
  request: Effect.Effect<A, E, Crypto.Crypto>,
): Promise<ControlPlaneResult<DispatchResult>> =>
  runOperationWithCrypto(request.pipe(Effect.flatMap((built) => dispatch(built))))

const runOperationWithCrypto = async <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient | Crypto.Crypto>,
): Promise<ControlPlaneResult<A>> => {
  const exit = await activeTransportSession.runPromiseExit(operation)
  return Exit.match(exit, {
    onFailure: (cause) => ({ ok: false, details: Cause.pretty(cause) }),
    onSuccess: (value) => ({ ok: true, value }),
  })
}

type StreamCallbacks<Snapshot, Event> = {
  readonly onSnapshot: (snapshot: Snapshot) => void
  readonly onEvent: (event: Event) => void
  readonly onError: (details: string) => void
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
  const timeout = globalThis.setTimeout(reconnect, delay)
  return () => globalThis.clearTimeout(timeout)
}

export interface SubscriptionSupervisorOptions<Session> {
  readonly afterSequence: () => Sequence | undefined
  readonly currentSession: () => Session
  readonly startAttempt: (
    session: Session,
    afterSequence: Sequence | undefined,
    onFailure: (details: string) => void,
  ) => () => void
  readonly replaceSession: (failedSession: Session) => Promise<void>
  readonly onError: (details: string) => void
  readonly schedule?: ReconnectSchedule
}

export const superviseSubscription = <Session>({
  afterSequence,
  currentSession,
  startAttempt,
  replaceSession,
  onError,
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
    stopAttempt = startAttempt(session, afterSequence(), (details) => {
      if (stopped || retrying) {
        return
      }
      retrying = true
      attempt += 1
      stopAttempt?.()
      stopAttempt = undefined
      onError(details)
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
  onFailure: (details: string) => void,
) => {
  const fiber = session.runFork(
    stream.pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => Effect.sync(() => onFailure(Cause.pretty(cause))),
        onSuccess: () => Effect.sync(() => onFailure("Control plane subscription ended.")),
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
    onError: callbacks.onError,
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
    onError: callbacks.onError,
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
