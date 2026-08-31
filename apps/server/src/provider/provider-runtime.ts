import * as NodeServices from "@effect/platform-node/NodeServices"
import { ProviderDriverKind } from "@noyau/contracts/entities/environment"
import { threadLiveLayer } from "@noyau/server/thread-live"
import { Effect, Layer } from "effect"

import { makeClaudeProvider, type ClaudeAdapterOptions } from "./claude-agent.ts"
import { makeCodexProvider, type CodexAdapterOptions } from "./codex-app-server.ts"
import { makeCursorProvider, type CursorAdapterOptions } from "./cursor-acp.ts"
import {
  composeProviderPorts,
  makeProviderInstanceRegistry,
  ProviderInstanceRegistry,
  type ProviderDriverFactory,
} from "./provider-instance-registry.ts"
import { ProviderPort, type ProviderPortService } from "./provider-port.ts"
import { readServerSettings } from "./provider-settings.ts"
import { turnUserInputRegistryLayer } from "./turn-user-input-registry.ts"

export interface ProviderRuntimeOptions {
  readonly cursor?: CursorAdapterOptions
  readonly claude?: ClaudeAdapterOptions
  readonly codex?: CodexAdapterOptions
}

const builtinDrivers = (options: ProviderRuntimeOptions): ReadonlyArray<ProviderDriverFactory> => [
  {
    kind: ProviderDriverKind.make("cursor"),
    make: ({ instanceId, config }) =>
      makeCursorProvider({
        ...options.cursor,
        instanceId,
        instanceConfig: config.config,
      }) as Effect.Effect<ProviderPortService>,
  },
  {
    kind: ProviderDriverKind.make("claude"),
    make: ({ instanceId, config }) =>
      makeClaudeProvider({
        ...options.claude,
        instanceId,
        instanceConfig: config.config,
      }) as Effect.Effect<ProviderPortService>,
  },
  {
    kind: ProviderDriverKind.make("codex"),
    make: ({ instanceId, config }) =>
      makeCodexProvider({
        ...options.codex,
        instanceId,
        instanceConfig: config.config,
      }) as Effect.Effect<ProviderPortService>,
  },
]

const providerRegistryLayer = (options: ProviderRuntimeOptions) =>
  Layer.effect(
    ProviderInstanceRegistry,
    Effect.gen(function* () {
      const settings = yield* readServerSettings().pipe(
        Effect.orElseSucceed(() => ({ providerInstances: {} })),
      )
      const registry = yield* makeProviderInstanceRegistry(builtinDrivers(options))
      yield* registry.applySettings(settings.providerInstances)
      return registry
    }),
  )

export const providerRuntimeLayer = (options: ProviderRuntimeOptions = {}) =>
  Layer.effect(
    ProviderPort,
    Effect.gen(function* () {
      const registry = yield* ProviderInstanceRegistry
      return composeProviderPorts(registry)
    }),
  ).pipe(
    Layer.provideMerge(providerRegistryLayer(options)),
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(turnUserInputRegistryLayer),
    Layer.provideMerge(threadLiveLayer),
  )
