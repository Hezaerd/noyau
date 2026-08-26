import * as NodeServices from "@effect/platform-node/NodeServices"
import { threadLiveLayer } from "@noyau/server/thread-live"
import { Effect, Layer } from "effect"

import { makeCodexProvider, type CodexAdapterOptions } from "./codex-app-server.ts"
import { makeCursorProvider, type CursorAdapterOptions } from "./cursor-acp.ts"
import {
  ProviderPort,
  type ProviderEmit,
  type ProviderPortService,
  type ProviderTurnInput,
} from "./provider-port.ts"
import { turnUserInputRegistryLayer } from "./turn-user-input-registry.ts"

export const composeProviderPorts = (
  cursor: ProviderPortService,
  codex: ProviderPortService,
): ProviderPortService =>
  ProviderPort.of({
    status: Effect.gen(function* () {
      const cursorStatuses = yield* cursor.status
      const codexStatuses = yield* codex.status
      return { cursor: cursorStatuses.cursor, codex: codexStatuses.codex }
    }),
    startTurn: (input: ProviderTurnInput, emit: ProviderEmit) =>
      input.provider === "codex" ? codex.startTurn(input, emit) : cursor.startTurn(input, emit),
    interrupt: (threadId) =>
      cursor.interrupt(threadId).pipe(Effect.andThen(codex.interrupt(threadId))),
    stop: (threadId) => cursor.stop(threadId).pipe(Effect.andThen(codex.stop(threadId))),
    reapIdle: (threadId) =>
      cursor
        .reapIdle(threadId)
        .pipe(
          Effect.flatMap((reaped) => (reaped ? Effect.succeed(true) : codex.reapIdle(threadId))),
        ),
    stopAll: cursor.stopAll.pipe(Effect.andThen(codex.stopAll)),
    respondApproval: (threadId, requestId, decision) =>
      cursor
        .respondApproval(threadId, requestId, decision)
        .pipe(Effect.andThen(codex.respondApproval(threadId, requestId, decision))),
    respondUserInput: (threadId, requestId, answers) =>
      cursor
        .respondUserInput(threadId, requestId, answers)
        .pipe(Effect.andThen(codex.respondUserInput(threadId, requestId, answers))),
    drain: cursor.drain.pipe(Effect.andThen(codex.drain)),
  })

export interface ProviderRuntimeOptions {
  readonly cursor?: CursorAdapterOptions
  readonly codex?: CodexAdapterOptions
}

export const providerRuntimeLayer = (options: ProviderRuntimeOptions = {}) =>
  Layer.effect(
    ProviderPort,
    Effect.gen(function* () {
      const cursor = yield* makeCursorProvider(options.cursor ?? {})
      const codex = yield* makeCodexProvider(options.codex ?? {})
      return composeProviderPorts(cursor, codex)
    }),
  ).pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(turnUserInputRegistryLayer),
    Layer.provideMerge(threadLiveLayer),
  )
