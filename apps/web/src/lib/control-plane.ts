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
      Layer.provide(RpcSerialization.layerNdjson),
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

const runtime = ManagedRuntime.make(
  Layer.merge(
    ControlPlaneClient.layer(controlPlaneConfig),
    Layer.succeed(Crypto.Crypto)(browserCrypto),
  ),
)

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
  const exit = await runtime.runPromiseExit(operation)

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
  const exit = await runtime.runPromiseExit(operation)
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

const startSubscription = <Snapshot, Event>(
  stream: Effect.Effect<void, ControlPlaneStreamError, ControlPlaneClient>,
  callbacks: StreamCallbacks<Snapshot, Event>,
) => {
  const fiber = runtime.runFork(
    stream.pipe(
      Effect.tapCause((cause) => Effect.sync(() => callbacks.onError(Cause.pretty(cause)))),
    ),
  )
  return () => {
    runtime.runFork(Fiber.interrupt(fiber))
  }
}

const sequenceOf = (item: ShellStreamItem | ProjectStreamItem): Sequence | undefined => {
  if (item.kind === "snapshot") {
    return item.snapshot.snapshotSequence
  }
  if (item.kind === "event") {
    return item.event.sequence
  }
  return undefined
}

export const acceptsSequence = (
  lastSequence: Sequence | undefined,
  nextSequence: Sequence,
): boolean => lastSequence === undefined || nextSequence > lastSequence

const consumeShellStream = (
  stream: Stream.Stream<ShellStreamItem, ControlPlaneStreamError>,
  callbacks: StreamCallbacks<ShellSnapshot, ShellLiveEvent>,
) => {
  let lastSequence: Sequence | undefined
  return stream.pipe(
    Stream.runForEach((item) =>
      Effect.sync(() => {
        const sequence = sequenceOf(item)
        if (
          item.kind === "synchronized" ||
          sequence === undefined ||
          !acceptsSequence(lastSequence, sequence)
        ) {
          return
        }
        lastSequence = sequence
        if (item.kind === "snapshot") {
          callbacks.onSnapshot(item.snapshot)
        } else if (item.kind === "event") {
          callbacks.onEvent(item.event)
        }
      }),
    ),
  )
}

const consumeProjectStream = (
  stream: Stream.Stream<ProjectStreamItem, ControlPlaneStreamError>,
  callbacks: StreamCallbacks<BoardSnapshot, EventEnvelope>,
) => {
  let lastSequence: Sequence | undefined
  return stream.pipe(
    Stream.runForEach((item) =>
      Effect.sync(() => {
        const sequence = sequenceOf(item)
        if (
          item.kind === "synchronized" ||
          sequence === undefined ||
          !acceptsSequence(lastSequence, sequence)
        ) {
          return
        }
        lastSequence = sequence
        if (item.kind === "snapshot") {
          callbacks.onSnapshot(item.snapshot)
        } else if (item.kind === "event") {
          callbacks.onEvent(item.event)
        }
      }),
    ),
  )
}

export const subscribeShell = (
  afterSequence: Sequence | undefined,
  callbacks: StreamCallbacks<ShellSnapshot, ShellLiveEvent>,
) => {
  const stream = Effect.gen(function* () {
    const client = yield* ControlPlaneClient
    return yield* consumeShellStream(
      client[RPC_METHODS.subscribeShell](afterSequence === undefined ? {} : { afterSequence }),
      callbacks,
    )
  })
  return startSubscription(stream, callbacks)
}

export const subscribeProject = (
  projectId: ProjectId,
  afterSequence: Sequence | undefined,
  callbacks: StreamCallbacks<BoardSnapshot, EventEnvelope>,
) => {
  const stream = Effect.gen(function* () {
    const client = yield* ControlPlaneClient
    return yield* consumeProjectStream(
      client[RPC_METHODS.subscribeProject](
        afterSequence === undefined ? { projectId } : { projectId, afterSequence },
      ),
      callbacks,
    )
  })
  return startSubscription(stream, callbacks)
}
