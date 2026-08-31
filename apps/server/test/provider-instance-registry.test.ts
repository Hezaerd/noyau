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
import { Effect, Ref } from "effect"

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
    startTurn: (turn) => Ref.update(input.started, (started) => [...started, turn.provider]),
    interrupt: () => Effect.void,
    stop: () => Effect.void,
    reapIdle: () => Effect.succeed(false),
    stopAll: Effect.void,
    respondApproval: () => Effect.void,
    respondUserInput: () => Effect.void,
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
})
