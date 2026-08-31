import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, layer } from "@effect/vitest"
import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { makeMcpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import { Effect, Layer } from "effect"

import { testServerConfigLayer } from "./fixtures.ts"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const firstTurnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const secondTurnId = TurnId.make("30000000-0000-4000-8000-000000000002")

layer(Layer.merge(testServerConfigLayer({ port: 43_123 }), NodeServices.layer))(
  "MCP session registry",
  (it) => {
    it.effect("keeps one credential across Turns and rebinds the active Turn safely", () =>
      Effect.gen(function* () {
        let timestamp = 1_000
        const registry = yield* makeMcpSessionRegistry({
          now: () => timestamp,
          livenessWindowMs: 100,
        })
        const first = yield* registry.issue({ projectId, threadId })
        const firstToken = first.config.authorizationHeader.replace(/^Bearer\s+/, "")
        assert.strictEqual(first.config.endpoint, "http://127.0.0.1:43123/mcp")
        assert.isAbove(firstToken.length, 20)
        assert.isUndefined(yield* registry.resolve(firstToken))

        yield* registry.activateTurn(threadId, firstTurnId)
        const firstScope = yield* registry.resolve(firstToken)
        assert.strictEqual(firstScope?.projectId, projectId)
        assert.strictEqual(firstScope?.threadId, threadId)
        assert.strictEqual(firstScope?.turnId, firstTurnId)
        assert.strictEqual(firstScope?.actorId, `agent:thread:${threadId}`)
        assert.isTrue(firstScope?.capabilities.has("board:read"))
        assert.isTrue(firstScope?.capabilities.has("board:write"))
        assert.isTrue(firstScope?.capabilities.has("thread:ask"))

        // A new Turn takes ownership of the same Session credential.
        yield* registry.activateTurn(threadId, secondTurnId)
        const secondScope = yield* registry.resolve(firstToken)
        assert.strictEqual(secondScope?.turnId, secondTurnId)

        // A late finalizer from the first Turn cannot clear the newer binding.
        yield* registry.deactivateTurn(threadId, firstTurnId)
        assert.strictEqual((yield* registry.resolve(firstToken))?.turnId, secondTurnId)

        // Settling the current Turn keeps the Session credential usable.
        yield* registry.deactivateTurn(threadId, secondTurnId)
        assert.strictEqual((yield* registry.resolve(firstToken))?.turnId, secondTurnId)
      }),
    )

    it.effect("rotates by Session, refreshes liveness, expires, and revokes", () =>
      Effect.gen(function* () {
        let timestamp = 1_000
        const registry = yield* makeMcpSessionRegistry({
          now: () => timestamp,
          livenessWindowMs: 100,
        })
        const first = yield* registry.issue({ projectId, threadId })
        const firstToken = first.config.authorizationHeader.replace(/^Bearer\s+/, "")
        yield* registry.activateTurn(threadId, firstTurnId)

        const rotated = yield* registry.issue({ projectId, threadId })
        const rotatedToken = rotated.config.authorizationHeader.replace(/^Bearer\s+/, "")
        assert.isUndefined(yield* registry.resolve(firstToken))
        assert.isUndefined(yield* registry.resolve(rotatedToken))

        yield* registry.activateTurn(threadId, secondTurnId)
        assert.isDefined(yield* registry.resolve(rotatedToken))

        timestamp += 90
        assert.isTrue(yield* registry.touchSession(threadId))
        timestamp += 90
        assert.isDefined(yield* registry.resolve(rotatedToken))

        timestamp += 101
        assert.isFalse(yield* registry.touchSession(threadId))
        assert.isUndefined(yield* registry.resolve(rotatedToken))

        assert.isFalse(yield* registry.touchSession(threadId))

        timestamp += 1
        const revocable = yield* registry.issue({ projectId, threadId })
        const revocableToken = revocable.config.authorizationHeader.replace(/^Bearer\s+/, "")
        yield* registry.activateTurn(threadId, firstTurnId)
        assert.isDefined(yield* registry.resolve(revocableToken))
        yield* registry.revokeSession(threadId)
        assert.isFalse(yield* registry.touchSession(threadId))
        assert.isUndefined(yield* registry.resolve(revocableToken))
      }),
    )
  },
)
