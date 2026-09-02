import {
  emptyProviderInstanceView,
  ProviderInstanceId,
  providerInstanceView,
  resolveProviderInstanceEnabled,
  type ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceView,
  type ProviderInstanceViewMap,
} from "@noyau/contracts/entities/environment"
import { hydrateProviderInstanceConfigs } from "@noyau/contracts/settings"
import type { McpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import type { ThreadLive } from "@noyau/server/thread-live"
import { Context, Effect, Layer, Ref } from "effect"
import type { FileSystem, Path, Scope } from "effect"
import type { ChildProcessSpawner } from "effect/unstable/process"

import {
  ProviderPort,
  ProviderForkUnavailable,
  type ProviderEmit,
  type ProviderPortService,
  type ProviderTurnInput,
} from "./provider-port.ts"
import type { TurnUserInputRegistry } from "./turn-user-input-registry.ts"

export type ProviderDriverRequirements =
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | McpSessionRegistry
  | Path.Path
  | Scope.Scope
  | ThreadLive
  | TurnUserInputRegistry

export interface ProviderDriverFactory {
  readonly kind: ProviderDriverKind
  readonly make: (input: {
    readonly instanceId: ProviderInstanceId
    readonly config: ProviderInstanceConfig
  }) => Effect.Effect<ProviderPortService>
}

type LiveSlot = {
  readonly instanceId: ProviderInstanceId
  readonly config: ProviderInstanceConfig
  readonly enabled: boolean
  readonly port: ProviderPortService | null
  readonly view: ProviderInstanceView
}

const slotSignature = (config: ProviderInstanceConfig, enabled: boolean): string =>
  JSON.stringify({
    driver: config.driver,
    enabled,
    displayName: config.displayName ?? null,
    config: config.config ?? null,
  })

const failTurn = (input: ProviderTurnInput, emit: ProviderEmit, lastError: string) =>
  Effect.gen(function* () {
    yield* emit({
      _tag: "session",
      threadId: input.threadId,
      turnId: input.turnId,
      status: "error",
      resumeCursor: input.resumeCursor,
      lastError,
    })
    yield* emit({
      _tag: "turn-ended",
      threadId: input.threadId,
      turnId: input.turnId,
      state: "error",
      lastError,
    })
  })

const viewFromPort = Effect.fn("ProviderInstanceRegistry.viewFromPort")(function* (
  instanceId: ProviderInstanceId,
  driver: ProviderDriverKind,
  port: ProviderPortService,
) {
  const statuses = yield* port.status
  const own = statuses[instanceId]
  const first = own ?? Object.values(statuses)[0]
  if (first === undefined) {
    return providerInstanceView({ instanceId, driver, enabled: true })
  }
  return providerInstanceView({
    instanceId,
    driver,
    enabled: true,
    probe: {
      installed: first.installed,
      handshakeOk: first.handshakeOk,
      version: first.version,
      plan: first.plan,
      binaryPath: first.binaryPath,
      models: first.models ?? [],
    },
  })
})

export interface ProviderInstanceRegistryService {
  readonly get: (id: ProviderInstanceId) => Effect.Effect<ProviderPortService | undefined>
  readonly values: Effect.Effect<ReadonlyArray<ProviderPortService>>
  readonly status: Effect.Effect<ProviderInstanceViewMap>
  readonly applySettings: (
    instances: Parameters<typeof hydrateProviderInstanceConfigs>[0]["providerInstances"],
  ) => Effect.Effect<ProviderInstanceViewMap>
}

export class ProviderInstanceRegistry extends Context.Service<
  ProviderInstanceRegistry,
  ProviderInstanceRegistryService
>()("@noyau/server/provider/ProviderInstanceRegistry") {}

export const composeProviderPorts = (
  registry: ProviderInstanceRegistryService,
): ProviderPortService =>
  ProviderPort.of({
    status: registry.status,
    listSkills: (provider, workspaceRoot) =>
      registry
        .get(provider)
        .pipe(
          Effect.flatMap((port) =>
            port === undefined ? Effect.succeed([]) : port.listSkills(provider, workspaceRoot),
          ),
        ),
    startTurn: (input, emit) =>
      Effect.gen(function* () {
        const port = yield* registry.get(input.provider)
        if (port === undefined) {
          return yield* failTurn(
            input,
            emit,
            `Provider instance '${input.provider}' is disabled or missing.`,
          )
        }
        return yield* port.startTurn(input, emit)
      }),
    fork: (input) =>
      registry.get(input.provider).pipe(
        Effect.flatMap((port) =>
          port === undefined
            ? Effect.fail(
                new ProviderForkUnavailable({
                  message: `Provider instance '${input.provider}' is disabled or missing.`,
                }),
              )
            : port.fork === undefined
              ? Effect.fail(
                  new ProviderForkUnavailable({ message: "This provider cannot fork sessions." }),
                )
              : port.fork(input),
        ),
      ),
    interrupt: (threadId) =>
      registry.values.pipe(
        Effect.flatMap((ports) =>
          Effect.forEach(ports, (port) => port.interrupt(threadId), { discard: true }),
        ),
      ),
    stop: (threadId) =>
      registry.values.pipe(
        Effect.flatMap((ports) =>
          Effect.forEach(ports, (port) => port.stop(threadId), { discard: true }),
        ),
      ),
    reapIdle: (threadId) =>
      Effect.gen(function* () {
        const ports = yield* registry.values
        for (const port of ports) {
          if (yield* port.reapIdle(threadId)) {
            return true
          }
        }
        return false
      }),
    stopAll: registry.values.pipe(
      Effect.flatMap((ports) => Effect.forEach(ports, (port) => port.stopAll, { discard: true })),
    ),
    respondApproval: (threadId, requestId, decision) =>
      registry.values.pipe(
        Effect.flatMap((ports) =>
          Effect.forEach(ports, (port) => port.respondApproval(threadId, requestId, decision), {
            discard: true,
          }),
        ),
      ),
    respondUserInput: (threadId, requestId, answers) =>
      registry.values.pipe(
        Effect.flatMap((ports) =>
          Effect.forEach(ports, (port) => port.respondUserInput(threadId, requestId, answers), {
            discard: true,
          }),
        ),
      ),
    reserveUserInput: (threadId, requestId) =>
      Effect.gen(function* () {
        const ports = yield* registry.values
        for (const port of ports) {
          if (yield* port.reserveUserInput(threadId, requestId)) {
            return true
          }
        }
        return false
      }),
    releaseUserInput: (threadId, requestId) =>
      registry.values.pipe(
        Effect.flatMap((ports) =>
          Effect.forEach(ports, (port) => port.releaseUserInput(threadId, requestId), {
            discard: true,
          }),
        ),
      ),
    drain: registry.values.pipe(
      Effect.flatMap((ports) => Effect.forEach(ports, (port) => port.drain, { discard: true })),
    ),
  })

export const makeProviderInstanceRegistry = Effect.fn("makeProviderInstanceRegistry")(function* (
  drivers: ReadonlyArray<ProviderDriverFactory>,
) {
  const driverByKind = new Map(drivers.map((driver) => [driver.kind, driver] as const))
  const slotsRef = yield* Ref.make(new Map<string, LiveSlot>())

  const buildSlot = Effect.fn("ProviderInstanceRegistry.buildSlot")(function* (
    instanceId: ProviderInstanceId,
    config: ProviderInstanceConfig,
  ) {
    const enabled = resolveProviderInstanceEnabled(config)
    if (!enabled) {
      return {
        instanceId,
        config,
        enabled: false,
        port: null,
        view: emptyProviderInstanceView(instanceId, config.driver, false),
      } satisfies LiveSlot
    }
    const factory = driverByKind.get(config.driver)
    if (factory === undefined) {
      return {
        instanceId,
        config,
        enabled: true,
        port: null,
        view: emptyProviderInstanceView(instanceId, config.driver, true),
      } satisfies LiveSlot
    }
    const port = yield* factory.make({ instanceId, config })
    return {
      instanceId,
      config,
      enabled: true,
      port,
      view: yield* viewFromPort(instanceId, config.driver, port),
    } satisfies LiveSlot
  })

  const applySettings: ProviderInstanceRegistryService["applySettings"] = Effect.fn(
    "ProviderInstanceRegistry.applySettings",
  )(function* (instances) {
    const hydrated = hydrateProviderInstanceConfigs({ providerInstances: instances })
    const previous = yield* Ref.get(slotsRef)
    const next = new Map<string, LiveSlot>()
    for (const [rawId, config] of Object.entries(hydrated)) {
      const instanceId = ProviderInstanceId.make(rawId)
      const enabled = resolveProviderInstanceEnabled(config)
      const existing = previous.get(rawId)
      if (
        existing !== undefined &&
        slotSignature(existing.config, existing.enabled) === slotSignature(config, enabled)
      ) {
        next.set(rawId, existing)
        continue
      }
      if (existing !== undefined && existing.port !== null) {
        yield* existing.port.stopAll
      }
      next.set(rawId, yield* buildSlot(instanceId, config))
    }
    for (const [rawId, existing] of previous) {
      if (!next.has(rawId) && existing.port !== null) {
        yield* existing.port.stopAll
      }
    }
    yield* Ref.set(slotsRef, next)
    return Object.fromEntries([...next.values()].map((slot) => [slot.instanceId, slot.view]))
  })

  const service: ProviderInstanceRegistryService = {
    get: (id) =>
      Ref.get(slotsRef).pipe(
        Effect.map((slots) => {
          const slot = slots.get(id)
          return slot?.enabled === true ? (slot.port ?? undefined) : undefined
        }),
      ),
    values: Ref.get(slotsRef).pipe(
      Effect.map((slots) =>
        [...slots.values()].flatMap((slot) => (slot.port === null ? [] : [slot.port])),
      ),
    ),
    status: Ref.get(slotsRef).pipe(
      Effect.map((slots) =>
        Object.fromEntries([...slots.values()].map((slot) => [slot.instanceId, slot.view])),
      ),
    ),
    applySettings,
  }

  return service
})

export const providerInstanceRegistryLayer = (drivers: ReadonlyArray<ProviderDriverFactory>) =>
  Layer.effect(ProviderInstanceRegistry, makeProviderInstanceRegistry(drivers))

export const staticProviderRegistryLayer = Layer.succeed(ProviderInstanceRegistry)({
  get: () => Effect.succeed(undefined),
  values: Effect.succeed([]),
  status: Effect.succeed({}),
  applySettings: () => Effect.succeed({}),
})
