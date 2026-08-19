import type { BoardSnapshot, EventCursor } from "@noyau/protocol/board"
import type { EventEnvelope } from "@noyau/protocol/events"
import type { ProjectId, TicketId } from "@noyau/protocol/ids"
import type { TicketReceipt } from "@noyau/protocol/receipts"
import { ControlPlaneRpcs, type ProjectEvent } from "@noyau/protocol/rpc"
import type { TicketCommandRequest } from "@noyau/protocol/ticket/commands"
import { Cause, Context, Crypto, Effect, Exit, Fiber, Layer, ManagedRuntime, Stream } from "effect"
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
    const socketLayer = Layer.effect(Socket.Socket, Socket.makeWebSocket(config.rpcUrl)).pipe(
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

const runOperation = async <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient | Crypto.Crypto>,
): Promise<ControlPlaneResult<A>> => {
  const exit = await runtime.runPromiseExit(operation)

  return Exit.match(exit, {
    onFailure: (cause) => ({ ok: false, details: Cause.pretty(cause) }),
    onSuccess: (value) => ({ ok: true, value }),
  })
}

const getBoardSnapshot = Effect.fn("ControlPlaneClient.getBoardSnapshot")(function* (
  projectId: ProjectId,
) {
  const client = yield* ControlPlaneClient
  return yield* client.GetBoardSnapshot({ projectId })
})

const getTicketActivity = Effect.fn("ControlPlaneClient.getTicketActivity")(function* (
  projectId: ProjectId,
  ticketId: TicketId,
) {
  const client = yield* ControlPlaneClient
  return yield* client.GetTicketActivity({ projectId, ticketId })
})

const submitCommand = Effect.fn("ControlPlaneClient.submitTicketCommand")(function* (
  projectId: ProjectId,
  request: TicketCommandRequest,
) {
  const client = yield* ControlPlaneClient
  return yield* client.SubmitTicketCommand({ projectId, request })
})

export const loadBoardSnapshot = (
  projectId: ProjectId,
): Promise<ControlPlaneResult<BoardSnapshot>> => runOperation(getBoardSnapshot(projectId))

export const loadTicketActivity = (
  projectId: ProjectId,
  ticketId: TicketId,
): Promise<ControlPlaneResult<ReadonlyArray<EventEnvelope>>> =>
  runOperation(getTicketActivity(projectId, ticketId))

export const submitTicketCommand = (
  projectId: ProjectId,
  request: TicketCommandRequest,
): Promise<ControlPlaneResult<TicketReceipt>> => runOperation(submitCommand(projectId, request))

export const buildAndSubmitTicketCommand = <A extends TicketCommandRequest, E>(
  projectId: ProjectId,
  request: Effect.Effect<A, E, Crypto.Crypto>,
): Promise<ControlPlaneResult<TicketReceipt>> =>
  runOperation(request.pipe(Effect.flatMap((built) => submitCommand(projectId, built))))

export const subscribeProjectEvents = (
  projectId: ProjectId,
  cursor: EventCursor,
  onEvent: (event: ProjectEvent) => void,
  onError: (details: string) => void,
) => {
  const stream = Effect.gen(function* () {
    const client = yield* ControlPlaneClient
    return yield* client
      .SubscribeProjectEvents({ projectId, cursor })
      .pipe(Stream.runForEach((event) => Effect.sync(() => onEvent(event))))
  }).pipe(Effect.tapCause((cause) => Effect.sync(() => onError(Cause.pretty(cause)))))
  const fiber = runtime.runFork(stream)

  return () => {
    runtime.runFork(Fiber.interrupt(fiber))
  }
}
