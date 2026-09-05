import { assert, describe, it } from "@effect/vitest"
import {
  ProviderDriverKind,
  ProviderInstanceId,
  providerInstanceView,
} from "@noyau/contracts/entities/environment"
import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import {
  composeProviderPorts,
  makeProviderInstanceRegistry,
  type ProviderDriverFactory,
} from "@noyau/server/provider/provider-instance-registry"
import {
  ProviderPort,
  singleInstanceStatuses,
  type ProviderEmit,
  type ProviderPortService,
  type ProviderSignal,
} from "@noyau/server/provider/provider-port"
import { Deferred, Effect, Fiber, Option, Ref } from "effect"

const cursorId = ProviderInstanceId.make("cursor")
const claudeId = ProviderInstanceId.make("claude")
const cursorDriver = ProviderDriverKind.make("cursor")
const claudeDriver = ProviderDriverKind.make("claude")

const stubPort = (input: {
  readonly instanceId: ProviderInstanceId
  readonly driver: ProviderDriverKind
  readonly started: Ref.Ref<ReadonlyArray<string>>
}): ProviderPortService =>
  ProviderPort.of({
    status: Effect.succeed(
      singleInstanceStatuses(
        providerInstanceView({
          instanceId: input.instanceId,
          driver: input.driver,
          enabled: true,
          probe: {
            installed: true,
            handshakeOk: true,
            version: null,
            plan: null,
            binaryPath: "/bin/fake",
            models: [],
          },
        }),
      ),
    ),
    listSkills: () => Effect.succeed([]),
    startTurn: (turn) => Ref.update(input.started, (started) => [...started, turn.provider]),
    interrupt: () => Effect.void,
    stop: () => Effect.void,
    reapIdle: () => Effect.succeed(false),
    stopAll: Effect.void,
    respondApproval: () => Effect.void,
    respondUserInput: () => Effect.void,
    reserveUserInput: () => Effect.succeed(false),
    releaseUserInput: () => Effect.void,
    drain: Effect.void,
  })

const recordingDriver = (
  kind: ProviderDriverKind,
  probed: Ref.Ref<ReadonlyArray<string>>,
  started: Ref.Ref<ReadonlyArray<string>>,
): ProviderDriverFactory => ({
  kind,
  make: ({ instanceId }) =>
    Effect.gen(function* () {
      yield* Ref.update(probed, (ids) => [...ids, instanceId])
      return stubPort({ instanceId, driver: kind, started })
    }),
})

const turnInput = {
  projectId: ProjectId.make("10000000-0000-4000-8000-000000000001"),
  threadId: ThreadId.make("20000000-0000-4000-8000-000000000001"),
  turnId: TurnId.make("30000000-0000-4000-8000-000000000001"),
  provider: cursorId,
  text: "hello",
  workspaceRoot: "/tmp/noyau",
  runtimeMode: "full-access" as const,
  modelSelection: null,
  resumeCursor: null,
}

describe("provider instance registry", () => {
  it.effect("ne sonde pas une instance disabled et n'emprunte pas Cursor", () =>
    Effect.gen(function* () {
      const probed = yield* Ref.make<ReadonlyArray<string>>([])
      const started = yield* Ref.make<ReadonlyArray<string>>([])
      const signals = yield* Ref.make<ReadonlyArray<ProviderSignal>>([])
      const registry = yield* makeProviderInstanceRegistry([
        recordingDriver(cursorDriver, probed, started),
        recordingDriver(claudeDriver, probed, started),
      ])

      yield* registry.applySettings({
        [cursorId]: { driver: cursorDriver, enabled: false },
        [claudeId]: { driver: claudeDriver },
      })

      assert.deepStrictEqual(yield* Ref.get(probed), [claudeId])
      const status = yield* registry.status
      assert.strictEqual(status[cursorId]?.enabled, false)
      assert.strictEqual(status[cursorId]?.handshakeOk, false)
      assert.strictEqual(status[claudeId]?.enabled, true)

      const emit: ProviderEmit = (signal) => Ref.update(signals, (current) => [...current, signal])
      yield* composeProviderPorts(registry).startTurn(turnInput, emit)

      assert.deepStrictEqual(yield* Ref.get(started), [])
      const emitted = yield* Ref.get(signals)
      assert.strictEqual(emitted[0]?._tag, "session")
      assert.strictEqual(emitted[0]?._tag === "session" ? emitted[0].status : undefined, "error")
      assert.strictEqual(emitted[1]?._tag, "turn-ended")
    }),
  )

  it.effect("reconstruit une instance quand on la réactive", () =>
    Effect.gen(function* () {
      const probed = yield* Ref.make<ReadonlyArray<string>>([])
      const started = yield* Ref.make<ReadonlyArray<string>>([])
      const registry = yield* makeProviderInstanceRegistry([
        recordingDriver(cursorDriver, probed, started),
      ])

      yield* registry.applySettings({
        [cursorId]: { driver: cursorDriver, enabled: false },
      })
      assert.deepStrictEqual(yield* Ref.get(probed), [])

      yield* registry.applySettings({
        [cursorId]: { driver: cursorDriver, enabled: true },
      })
      assert.deepStrictEqual(yield* Ref.get(probed), [cursorId])
      assert.strictEqual((yield* registry.status)[cursorId]?.handshakeOk, true)
    }),
  )

  it.effect("sonde plusieurs instances en parallèle", () =>
    Effect.gen(function* () {
      const cursorStarted = yield* Deferred.make<void>()
      const claudeStarted = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const started = yield* Ref.make<ReadonlyArray<string>>([])
      const blockingDriver = (
        kind: ProviderDriverKind,
        entered: Deferred.Deferred<void>,
      ): ProviderDriverFactory => ({
        kind,
        make: ({ instanceId }) =>
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as(stubPort({ instanceId, driver: kind, started })),
          ),
      })
      const registry = yield* makeProviderInstanceRegistry([
        blockingDriver(cursorDriver, cursorStarted),
        blockingDriver(claudeDriver, claudeStarted),
      ])

      const applying = yield* registry.applySettings({}).pipe(Effect.forkChild)
      yield* Deferred.await(cursorStarted)
      yield* Deferred.await(claudeStarted)
      yield* Deferred.succeed(release, undefined)
      const status = yield* Fiber.join(applying)
      assert.deepStrictEqual(Object.keys(status), ["cursor", "claude", "codex"])
    }),
  )

  it.effect("sérialise deux applications de réglages concurrentes", () =>
    Effect.gen(function* () {
      const firstStarted = yield* Deferred.make<void>()
      const releaseFirst = yield* Deferred.make<void>()
      const secondStarted = yield* Deferred.make<void>()
      const calls = yield* Ref.make(0)
      const started = yield* Ref.make<ReadonlyArray<string>>([])
      const driver: ProviderDriverFactory = {
        kind: cursorDriver,
        make: ({ instanceId }) =>
          Effect.gen(function* () {
            const call = yield* Ref.getAndUpdate(calls, (value) => value + 1)
            if (call === 0) {
              yield* Deferred.succeed(firstStarted, undefined)
              yield* Deferred.await(releaseFirst)
            } else {
              yield* Deferred.succeed(secondStarted, undefined)
            }
            return stubPort({ instanceId, driver: cursorDriver, started })
          }),
      }
      const registry = yield* makeProviderInstanceRegistry([driver])
      const first = yield* registry
        .applySettings({
          [cursorId]: { driver: cursorDriver, displayName: "First" },
        })
        .pipe(Effect.forkChild)
      yield* Deferred.await(firstStarted)
      const second = yield* registry
        .applySettings({
          [cursorId]: { driver: cursorDriver, displayName: "Second" },
        })
        .pipe(Effect.forkChild)

      yield* Effect.yieldNow
      assert.isTrue(Option.isNone(yield* Deferred.poll(secondStarted)))
      yield* Deferred.succeed(releaseFirst, undefined)
      yield* Deferred.await(secondStarted)
      yield* Fiber.join(first)
      yield* Fiber.join(second)
      yield* registry.applySettings({
        [cursorId]: { driver: cursorDriver, displayName: "Second" },
      })
      assert.strictEqual(yield* Ref.get(calls), 2)
    }),
  )

  it.effect("borne à trois les constructions simultanées", () =>
    Effect.gen(function* () {
      const thirdStarted = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const active = yield* Ref.make(0)
      const maximum = yield* Ref.make(0)
      const started = yield* Ref.make<ReadonlyArray<string>>([])
      const driver: ProviderDriverFactory = {
        kind: cursorDriver,
        make: ({ instanceId }) =>
          Effect.gen(function* () {
            const count = yield* Ref.updateAndGet(active, (value) => value + 1)
            yield* Ref.update(maximum, (value) => Math.max(value, count))
            if (count === 3) {
              yield* Deferred.succeed(thirdStarted, undefined)
            }
            yield* Deferred.await(release)
            yield* Ref.update(active, (value) => value - 1)
            return stubPort({ instanceId, driver: cursorDriver, started })
          }),
      }
      const registry = yield* makeProviderInstanceRegistry([driver])
      const applying = yield* registry
        .applySettings({
          [ProviderInstanceId.make("cursor-two")]: { driver: cursorDriver },
          [ProviderInstanceId.make("cursor-three")]: { driver: cursorDriver },
          [ProviderInstanceId.make("cursor-four")]: { driver: cursorDriver },
        })
        .pipe(Effect.forkChild)

      yield* Deferred.await(thirdStarted)
      assert.strictEqual(yield* Ref.get(maximum), 3)
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(applying)
      assert.strictEqual(yield* Ref.get(maximum), 3)
    }),
  )

  it.effect("arrête l'ancienne instance avant de construire son remplacement", () =>
    Effect.gen(function* () {
      const stopped = yield* Ref.make(false)
      const replacements = yield* Ref.make(0)
      const started = yield* Ref.make<ReadonlyArray<string>>([])
      const driver: ProviderDriverFactory = {
        kind: cursorDriver,
        make: ({ instanceId }) =>
          Effect.gen(function* () {
            const count = yield* Ref.getAndUpdate(replacements, (value) => value + 1)
            if (count > 0) {
              assert.isTrue(yield* Ref.get(stopped))
            }
            const port = stubPort({ instanceId, driver: cursorDriver, started })
            return count === 0
              ? ProviderPort.of({ ...port, stopAll: Ref.set(stopped, true) })
              : port
          }),
      }
      const registry = yield* makeProviderInstanceRegistry([driver])
      yield* registry.applySettings({ [cursorId]: { driver: cursorDriver } })

      yield* registry.applySettings({
        [cursorId]: { driver: cursorDriver, displayName: "Cursor local" },
      })

      assert.strictEqual(yield* Ref.get(replacements), 2)
    }),
  )

  it.effect("nettoie les ports construits quand l'application est interrompue", () =>
    Effect.gen(function* () {
      const cursorViewStarted = yield* Deferred.make<void>()
      const holdCursorView = yield* Deferred.make<void>()
      const claudeStarted = yield* Deferred.make<void>()
      const stopped = yield* Deferred.make<void>()
      const started = yield* Ref.make<ReadonlyArray<string>>([])
      const cursorPort = ProviderPort.of({
        ...stubPort({ instanceId: cursorId, driver: cursorDriver, started }),
        status: Deferred.succeed(cursorViewStarted, undefined).pipe(
          Effect.andThen(Deferred.await(holdCursorView)),
          Effect.as(
            singleInstanceStatuses(
              providerInstanceView({ instanceId: cursorId, driver: cursorDriver, enabled: true }),
            ),
          ),
        ),
        stopAll: Deferred.succeed(stopped, undefined),
      })
      const registry = yield* makeProviderInstanceRegistry([
        { kind: cursorDriver, make: () => Effect.succeed(cursorPort) },
        {
          kind: claudeDriver,
          make: () => Deferred.succeed(claudeStarted, undefined).pipe(Effect.andThen(Effect.never)),
        },
      ])

      const applying = yield* registry.applySettings({}).pipe(Effect.forkChild)
      yield* Deferred.await(cursorViewStarted)
      yield* Deferred.await(claudeStarted)
      yield* Fiber.interrupt(applying)
      yield* Deferred.await(stopped)
    }),
  )

  it.effect("nettoie les ports construits quand une autre construction échoue", () =>
    Effect.gen(function* () {
      const cursorBuilt = yield* Deferred.make<void>()
      const stopped = yield* Deferred.make<void>()
      const started = yield* Ref.make<ReadonlyArray<string>>([])
      const cursorPort = ProviderPort.of({
        ...stubPort({ instanceId: cursorId, driver: cursorDriver, started }),
        stopAll: Deferred.succeed(stopped, undefined),
      })
      const registry = yield* makeProviderInstanceRegistry([
        {
          kind: cursorDriver,
          make: () => Deferred.succeed(cursorBuilt, undefined).pipe(Effect.as(cursorPort)),
        },
        {
          kind: claudeDriver,
          make: () => Deferred.await(cursorBuilt).pipe(Effect.andThen(Effect.die("probe failed"))),
        },
      ])

      const exit = yield* Effect.exit(registry.applySettings({}))
      assert.strictEqual(exit._tag, "Failure")
      yield* Deferred.await(stopped)
      assert.deepStrictEqual(yield* registry.status, {})
    }),
  )
})
