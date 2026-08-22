import { createConnection, type Socket } from "node:net"
import { tmpdir } from "node:os"

import { serverReleaseChannel, type NoyauReleaseChannel } from "@noyau/server/config"
import { Clock, Duration, Effect, Layer, Option, Queue, Schema } from "effect"

import type { PresenceActivity } from "./activity.ts"
import { DiscordPresence } from "./presence.ts"

const HANDSHAKE = 0
const FRAME = 1
const IPC_SLOT_COUNT = 10
const RECONNECT_DELAY = Duration.seconds(5)

/** Application IDs Discord publics — pas des secrets. */
export const DISCORD_APPLICATION_ID_LATEST = "1540464789850169484"
export const DISCORD_APPLICATION_ID_NIGHTLY = "1540445560736321627"
export const DISCORD_APPLICATION_ID_DEVELOPMENT = "1540812507592265738"

export const resolveDiscordApplicationId = (channel: NoyauReleaseChannel): string => {
  if (channel === "nightly") {
    return DISCORD_APPLICATION_ID_NIGHTLY
  }
  if (channel === "development") {
    return DISCORD_APPLICATION_ID_DEVELOPMENT
  }
  return DISCORD_APPLICATION_ID_LATEST
}

export class DiscordIpcError extends Schema.TaggedError<DiscordIpcError>()("DiscordIpcError", {
  operation: Schema.Literals(["connect", "write"]),
}) {}

interface DiscordHandshake {
  readonly v: 1
  readonly client_id: string
}

interface DiscordSetActivity {
  readonly cmd: "SET_ACTIVITY"
  readonly nonce: string
  readonly args: {
    readonly pid: number
    readonly activity: {
      readonly details: string
      readonly state: string
      readonly instance: false
      readonly timestamps: {
        readonly start: number
      }
    } | null
  }
}

type DiscordFramePayload = DiscordHandshake | DiscordSetActivity

export const discordIpcPath = (slot: number, platform: string, runtimeDir: string): string =>
  platform === "win32" ? `\\\\.\\pipe\\discord-ipc-${slot}` : `${runtimeDir}/discord-ipc-${slot}`

export const encodeDiscordFrame = (opcode: number, payload: DiscordFramePayload): Buffer => {
  const data = Buffer.from(JSON.stringify(payload), "utf8")
  const header = Buffer.alloc(8)
  header.writeUInt32LE(opcode, 0)
  header.writeUInt32LE(data.length, 4)
  return Buffer.concat([header, data])
}

const writeFrame = (socket: Socket, opcode: number, payload: DiscordFramePayload) =>
  Effect.callback<void, DiscordIpcError>((resume) => {
    socket.write(encodeDiscordFrame(opcode, payload), (error) => {
      resume(
        error === undefined || error === null
          ? Effect.void
          : Effect.fail(new DiscordIpcError({ operation: "write" })),
      )
    })
  })

const connectIpc = (path: string) =>
  Effect.callback<Socket, DiscordIpcError>((resume, signal) => {
    const socket = createConnection({ path })
    const onConnect = () => {
      socket.off("error", onError)
      resume(Effect.succeed(socket))
    }
    const onError = () => {
      socket.off("connect", onConnect)
      resume(Effect.fail(new DiscordIpcError({ operation: "connect" })))
    }
    socket.once("connect", onConnect)
    socket.once("error", onError)
    signal.addEventListener("abort", () => {
      socket.destroy()
    })
    return Effect.sync(() => {
      socket.destroy()
    })
  })

const openDiscordSocket = Effect.fn("DiscordIpc.open")(function* (
  clientId: string,
  runtimeDir: string,
) {
  const attempts = Array.from({ length: IPC_SLOT_COUNT }, (_, slot) =>
    connectIpc(discordIpcPath(slot, process.platform, runtimeDir)),
  )
  const socket = yield* Effect.firstSuccessOf(attempts)
  yield* writeFrame(socket, HANDSHAKE, { v: 1, client_id: clientId })
  return socket
})

const setActivity = (
  socket: Socket,
  activity: PresenceActivity | null,
  nonce: string,
  startedAt: number,
) =>
  writeFrame(socket, FRAME, {
    cmd: "SET_ACTIVITY",
    nonce,
    args: {
      pid: process.pid,
      activity:
        activity === null
          ? null
          : {
              details: activity.details,
              state: activity.state,
              instance: false,
              timestamps: { start: startedAt },
            },
    },
  })

const runIpcLoop = Effect.fn("DiscordIpc.runLoop")(function* (
  clientId: string,
  runtimeDir: string,
  startedAt: number,
  queue: Queue.Dequeue<PresenceActivity | null>,
) {
  let nonce = 0
  let desired: PresenceActivity | null = null
  let retry = false
  let socket: Socket | undefined

  const disconnect = () => {
    socket?.destroy()
    socket = undefined
  }

  const ensureSocket = Effect.fn("DiscordIpc.ensureSocket")(function* () {
    if (socket !== undefined && !socket.destroyed) {
      return socket
    }
    const next = yield* openDiscordSocket(clientId, runtimeDir)
    next.once("error", disconnect)
    next.once("close", disconnect)
    socket = next
    return next
  })

  yield* Effect.addFinalizer(() => Effect.sync(disconnect))

  while (true) {
    const incoming = retry
      ? yield* Queue.poll(queue)
      : yield* Queue.take(queue).pipe(Effect.map(Option.some))
    if (Option.isSome(incoming)) {
      desired = incoming.value
    }
    const published = yield* ensureSocket().pipe(
      Effect.flatMap((open) => {
        nonce += 1
        return setActivity(open, desired, String(nonce), startedAt)
      }),
      Effect.match({
        onFailure: () => false,
        onSuccess: () => true,
      }),
    )
    if (published) {
      retry = false
      continue
    }
    disconnect()
    yield* Effect.sleep(RECONNECT_DELAY)
    retry = true
  }
})

export const discordPresenceLayer = Layer.effect(
  DiscordPresence,
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis
    const channel = yield* serverReleaseChannel
    const queue = yield* Queue.sliding<PresenceActivity | null>(1)
    yield* runIpcLoop(resolveDiscordApplicationId(channel), tmpdir(), startedAt, queue).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Discord IPC stopped", { cause })),
      Effect.forkScoped,
    )

    return {
      publish: (activity: PresenceActivity | null) =>
        Queue.offer(queue, activity).pipe(Effect.asVoid),
    }
  }),
)
