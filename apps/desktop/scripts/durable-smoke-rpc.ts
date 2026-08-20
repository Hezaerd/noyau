import type { BoardSnapshot } from "@noyau/protocol/board"
import { ClientCommandRequest } from "@noyau/protocol/commands"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { Forbidden, MissingIdentity, ServiceUnavailable } from "@noyau/protocol/errors"
import { CommandId, ProjectId, ThreadId } from "@noyau/protocol/ids"
import {
  ControlPlaneRpcs,
  RPC_METHODS,
  type ProjectStreamItem,
  type ThreadStreamItem,
} from "@noyau/protocol/rpc"
import { Context, Crypto, Effect, Layer, ManagedRuntime, Option, Schema, Stream } from "effect"
import { RpcClient, RpcSerialization } from "effect/unstable/rpc"
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError"
import type * as RpcGroup from "effect/unstable/rpc/RpcGroup"
import { Socket } from "effect/unstable/socket"

export const durableJourney = {
  projectId: ProjectId.make("85000000-0000-4000-8000-000000000001"),
  threadId: ThreadId.make("85000000-0000-4000-8000-000000000002"),
  firstPrompt: "Keep this fake ACP Turn running across restart",
  secondPrompt: "Resume through session/load without replay",
} as const

interface SmokeBootstrap {
  readonly host: string
  readonly port: number
  readonly bearerToken: string
}

class SmokeRpcClient extends Context.Service<
  SmokeRpcClient,
  RpcClient.RpcClient<RpcGroup.Rpcs<typeof ControlPlaneRpcs>, RpcClientError>
>()("@noyau/desktop/SmokeRpcClient") {
  static layer(bootstrap: SmokeBootstrap) {
    const rpcUrl = new URL(`ws://${bootstrap.host}:${bootstrap.port}/rpc`)
    rpcUrl.searchParams.set("token", bootstrap.bearerToken)
    const socketLayer = Layer.effect(Socket.Socket, Socket.makeWebSocket(rpcUrl.toString())).pipe(
      Layer.provide(Socket.layerWebSocketConstructorGlobal),
    )
    return Layer.effect(SmokeRpcClient, RpcClient.make(ControlPlaneRpcs)).pipe(
      Layer.provide(RpcClient.layerProtocolSocket()),
      Layer.provide(socketLayer),
      Layer.provide(RpcSerialization.layerNdjson),
    )
  }
}

class SmokeSnapshotUnavailable extends Schema.TaggedError<SmokeSnapshotUnavailable>()(
  "SmokeSnapshotUnavailable",
  { detail: Schema.NonEmptyString },
) {}

type SmokeRpcError = RpcClientError | Forbidden | MissingIdentity | ServiceUnavailable

const cryptoService = Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) =>
    Effect.promise(() =>
      globalThis.crypto.subtle
        .digest(algorithm, new Uint8Array(data))
        .then((digest) => new Uint8Array(digest)),
    ),
})

const runtime = (bootstrap: SmokeBootstrap) =>
  ManagedRuntime.make(
    Layer.merge(SmokeRpcClient.layer(bootstrap), Layer.succeed(Crypto.Crypto)(cryptoService)),
  )

const run = <A, E>(bootstrap: SmokeBootstrap, effect: Effect.Effect<A, E, SmokeRpcClient>) => {
  const managedRuntime = runtime(bootstrap)
  return managedRuntime.runPromise(effect).finally(() => managedRuntime.dispose())
}

const request = (input: (typeof ClientCommandRequest)["Encoded"]) =>
  Schema.decodeSync(ClientCommandRequest)(input)

const commandId = (index: number) =>
  CommandId.make(`85000000-0000-4000-8000-${index.toString().padStart(12, "0")}`)

const dispatch = Effect.fn("DesktopSmoke.dispatch")(function* (
  client: SmokeRpcClient["Service"],
  command: ClientCommandRequest,
) {
  return yield* client[RPC_METHODS.dispatchCommand](command)
})

const readBoard = Effect.fn("DesktopSmoke.readBoard")(function* (
  client: SmokeRpcClient["Service"],
) {
  const item = yield* client[RPC_METHODS.subscribeProject]({
    projectId: durableJourney.projectId,
  }).pipe(
    Stream.filter(
      (frame): frame is Extract<ProjectStreamItem, { readonly kind: "snapshot" }> =>
        frame.kind === "snapshot",
    ),
    Stream.runHead,
  )
  if (Option.isNone(item)) {
    return yield* new SmokeSnapshotUnavailable({
      detail: "Project stream ended before its snapshot",
    })
  }
  return item.value.snapshot
})

const readThread = Effect.fn("DesktopSmoke.readThread")(function* (
  client: SmokeRpcClient["Service"],
) {
  const item = yield* client[RPC_METHODS.subscribeThread]({
    threadId: durableJourney.threadId,
  }).pipe(
    Stream.filter(
      (frame): frame is Extract<ThreadStreamItem, { readonly kind: "snapshot" }> =>
        frame.kind === "snapshot",
    ),
    Stream.runHead,
  )
  if (Option.isNone(item)) {
    return yield* new SmokeSnapshotUnavailable({
      detail: "Thread stream ended before its snapshot",
    })
  }
  return item.value.snapshot
})

const waitForThread = Effect.fn("DesktopSmoke.waitForThread")(function* (
  client: SmokeRpcClient["Service"],
  predicate: (snapshot: ThreadSnapshot) => boolean,
  label: string,
  attempts = 200,
): Effect.fn.Return<ThreadSnapshot, SmokeSnapshotUnavailable | SmokeRpcError> {
  const snapshot = yield* readThread(client)
  if (predicate(snapshot)) {
    return snapshot
  }
  if (attempts <= 1) {
    return yield* new SmokeSnapshotUnavailable({
      detail: `Timed out waiting for ${label}`,
    })
  }
  yield* Effect.sleep("25 millis")
  return yield* waitForThread(client, predicate, label, attempts - 1)
})

export const startInitialJourney = (
  bootstrap: SmokeBootstrap,
  workspaceRoot: string,
): Promise<{ readonly board: BoardSnapshot; readonly thread: ThreadSnapshot }> =>
  run(
    bootstrap,
    Effect.gen(function* () {
      const client = yield* SmokeRpcClient
      yield* dispatch(
        client,
        request({
          _tag: "project.create",
          commandId: commandId(1),
          payload: {
            projectId: durableJourney.projectId,
            name: "Durable Journey",
            workspaceRoot,
          },
        }),
      )
      yield* dispatch(
        client,
        request({
          _tag: "thread.create",
          commandId: commandId(2),
          payload: {
            threadId: durableJourney.threadId,
            projectId: durableJourney.projectId,
            title: "Durable smoke Thread",
          },
        }),
      )
      yield* dispatch(
        client,
        request({
          _tag: "thread.turn.start",
          commandId: commandId(3),
          payload: { threadId: durableJourney.threadId, text: durableJourney.firstPrompt },
        }),
      )
      const thread = yield* waitForThread(
        client,
        (snapshot) =>
          snapshot.session?.status === "running" &&
          snapshot.session.resumeCursor?.sessionId === "durable-smoke-session" &&
          snapshot.transcript.some(
            (item) => item._tag === "transcript.assistant" && item.text === "prompt-open",
          ),
        "the first fake ACP Turn to remain running",
      )
      return { board: yield* readBoard(client), thread }
    }),
  )

export const readRecoveredJourney = (
  bootstrap: SmokeBootstrap,
): Promise<{ readonly board: BoardSnapshot; readonly thread: ThreadSnapshot }> =>
  run(
    bootstrap,
    Effect.gen(function* () {
      const client = yield* SmokeRpcClient
      const thread = yield* waitForThread(
        client,
        (snapshot) =>
          snapshot.session?.status === "error" && snapshot.thread.latestTurn?.state === "error",
        "boot recovery to settle the running Session as error",
      )
      return { board: yield* readBoard(client), thread }
    }),
  )

export const resumeJourney = (bootstrap: SmokeBootstrap): Promise<ThreadSnapshot> =>
  run(
    bootstrap,
    Effect.gen(function* () {
      const client = yield* SmokeRpcClient
      yield* dispatch(
        client,
        request({
          _tag: "thread.turn.start",
          commandId: commandId(4),
          payload: { threadId: durableJourney.threadId, text: durableJourney.secondPrompt },
        }),
      )
      const running = yield* waitForThread(
        client,
        (snapshot) =>
          snapshot.turns.length === 2 &&
          snapshot.session?.status === "running" &&
          snapshot.transcript.filter(
            (item) => item._tag === "transcript.assistant" && item.text === "prompt-open",
          ).length === 2,
        "the resumed fake ACP Turn",
      )
      yield* dispatch(
        client,
        request({
          _tag: "session.stop",
          commandId: commandId(5),
          payload: { threadId: durableJourney.threadId },
        }),
      )
      yield* waitForThread(
        client,
        (snapshot) => snapshot.thread.latestTurn?.state === "interrupted",
        "the resumed Turn to stop",
      )
      return running
    }),
  )
