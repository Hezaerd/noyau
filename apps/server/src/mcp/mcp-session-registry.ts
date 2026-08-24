import type { ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { ActorId } from "@noyau/protocol/ids"
import { ServerConfig } from "@noyau/server/config"
import { Clock, Context, Crypto, Effect, Layer, SynchronizedRef } from "effect"

import type { McpInvocationScope } from "./mcp-invocation-context.ts"

const DEFAULT_LIVENESS_WINDOW_MS = 24 * 60 * 60 * 1_000

export interface McpCredentialRequest {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly turnId: TurnId
}

export interface McpProviderConfig {
  readonly endpoint: string
  readonly authorizationHeader: string
}

export interface McpIssuedCredential {
  readonly config: McpProviderConfig
}

export interface McpSessionRegistryService {
  readonly issue: (request: McpCredentialRequest) => Effect.Effect<McpIssuedCredential>
  readonly resolve: (rawToken: string) => Effect.Effect<McpInvocationScope | undefined>
  readonly revokeTurn: (turnId: TurnId) => Effect.Effect<void>
  readonly revokeAll: Effect.Effect<void>
}

export class McpSessionRegistry extends Context.Service<
  McpSessionRegistry,
  McpSessionRegistryService
>()("@noyau/server/mcp/McpSessionRegistry") {}

interface CredentialRecord {
  readonly scope: McpInvocationScope
  readonly lastAliveAt: number
}

interface RegistryState {
  readonly records: ReadonlyMap<string, CredentialRecord>
}

export interface McpSessionRegistryOptions {
  readonly livenessWindowMs?: number
  readonly now?: () => number
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

const tokenFromBytes = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url")

const endpointHost = (host: string): string => (host.includes(":") ? `[${host}]` : host)

export const makeMcpSessionRegistry = Effect.fn("McpSessionRegistry.make")(function* (
  options: McpSessionRegistryOptions = {},
) {
  const crypto = yield* Crypto.Crypto
  const config = yield* ServerConfig
  const state = yield* SynchronizedRef.make<RegistryState>({ records: new Map() })
  const currentTimeMillis = options.now ? Effect.sync(options.now) : Clock.currentTimeMillis
  const livenessWindowMs = options.livenessWindowMs ?? DEFAULT_LIVENESS_WINDOW_MS
  const endpoint = `http://${endpointHost(config.host)}:${config.port}/mcp`

  const hashToken = (token: string) =>
    crypto
      .digest("SHA-256", new TextEncoder().encode(token))
      .pipe(Effect.map(bytesToHex), Effect.orDie)

  const pruneExpired = (records: ReadonlyMap<string, CredentialRecord>, timestamp: number) => {
    const next = new Map(
      Array.from(records).filter(
        ([, record]) => timestamp - record.lastAliveAt <= livenessWindowMs,
      ),
    )
    return next.size === records.size ? records : next
  }

  const issue: McpSessionRegistryService["issue"] = Effect.fn("McpSessionRegistry.issue")(
    function* (request) {
      const issuedAt = yield* currentTimeMillis
      const rawToken = yield* crypto.randomBytes(32).pipe(Effect.map(tokenFromBytes), Effect.orDie)
      const tokenHash = yield* hashToken(rawToken)
      const scope: McpInvocationScope = {
        environmentId: config.environmentId,
        projectId: request.projectId,
        threadId: request.threadId,
        turnId: request.turnId,
        actorId: ActorId.make(`agent:thread:${request.threadId}`),
        capabilities: new Set(["board:read", "board:write"] as const),
        issuedAt,
      }
      yield* SynchronizedRef.update(state, ({ records }) => {
        const next = new Map(pruneExpired(records, issuedAt))
        for (const [hash, record] of next) {
          if (record.scope.turnId === request.turnId) {
            next.delete(hash)
          }
        }
        next.set(tokenHash, { scope, lastAliveAt: issuedAt })
        return { records: next }
      })
      return {
        config: {
          endpoint,
          authorizationHeader: `Bearer ${rawToken}`,
        },
      }
    },
  )

  const resolve: McpSessionRegistryService["resolve"] = Effect.fn("McpSessionRegistry.resolve")(
    function* (rawToken) {
      if (rawToken.length === 0) {
        return undefined
      }
      const tokenHash = yield* hashToken(rawToken)
      const timestamp = yield* currentTimeMillis
      return yield* SynchronizedRef.modify(state, ({ records }) => {
        const current = pruneExpired(records, timestamp)
        const record = current.get(tokenHash)
        if (record === undefined) {
          return [undefined, { records: current }] as const
        }
        const next = new Map(current)
        next.set(tokenHash, { ...record, lastAliveAt: timestamp })
        return [record.scope, { records: next }] as const
      })
    },
  )

  const revokeTurn: McpSessionRegistryService["revokeTurn"] = Effect.fn(
    "McpSessionRegistry.revokeTurn",
  )(function* (turnId) {
    yield* SynchronizedRef.update(state, ({ records }) => ({
      records: new Map(Array.from(records).filter(([, record]) => record.scope.turnId !== turnId)),
    }))
  })

  return McpSessionRegistry.of({
    issue,
    resolve,
    revokeTurn,
    revokeAll: SynchronizedRef.set(state, { records: new Map() }),
  })
})

export const mcpSessionRegistryLayer = Layer.effect(McpSessionRegistry, makeMcpSessionRegistry())
