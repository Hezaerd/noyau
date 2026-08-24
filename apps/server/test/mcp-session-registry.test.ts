import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, layer } from "@effect/vitest"
import { ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { makeMcpSessionRegistry } from "@noyau/server/mcp/mcp-session-registry"
import { Effect, Layer } from "effect"

import { testServerConfigLayer } from "./fixtures.ts"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

layer(Layer.merge(testServerConfigLayer({ port: 43_123 }), NodeServices.layer))(
  "MCP session registry",
  (it) => {
    it.effect("issues, rotates, expires, and revokes Turn-scoped MCP credentials", () =>
      Effect.gen(function* () {
        let timestamp = 1_000
        const registry = yield* makeMcpSessionRegistry({
          now: () => timestamp,
          livenessWindowMs: 100,
        })
        const first = yield* registry.issue({ projectId, threadId, turnId })
        const firstToken = first.config.authorizationHeader.replace(/^Bearer\s+/, "")
        assert.strictEqual(first.config.endpoint, "http://127.0.0.1:43123/mcp")
        assert.isAbove(firstToken.length, 20)

        const firstScope = yield* registry.resolve(firstToken)
        assert.strictEqual(firstScope?.projectId, projectId)
        assert.strictEqual(firstScope?.threadId, threadId)
        assert.strictEqual(firstScope?.turnId, turnId)
        assert.strictEqual(firstScope?.actorId, `agent:cursor:${turnId}`)
        assert.isTrue(firstScope?.capabilities.has("board:read"))
        assert.isTrue(firstScope?.capabilities.has("thread:ask"))

        const rotated = yield* registry.issue({ projectId, threadId, turnId })
        const rotatedToken = rotated.config.authorizationHeader.replace(/^Bearer\s+/, "")
        assert.isUndefined(yield* registry.resolve(firstToken))
        assert.isDefined(yield* registry.resolve(rotatedToken))

        timestamp += 101
        assert.isUndefined(yield* registry.resolve(rotatedToken))

        timestamp += 1
        const revocable = yield* registry.issue({ projectId, threadId, turnId })
        const revocableToken = revocable.config.authorizationHeader.replace(/^Bearer\s+/, "")
        yield* registry.revokeTurn(turnId)
        assert.isUndefined(yield* registry.resolve(revocableToken))
      }),
    )
  },
)
