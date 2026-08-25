import type { ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { ActorId } from "@noyau/protocol/ids"
import { ServerConfig } from "@noyau/server/config"
import { Clock, Context, Crypto, Effect, Layer, SynchronizedRef } from "effect"

import type { McpInvocationScope } from "./mcp-invocation-context.ts"

const DEFAULT_LIVENESS_WINDOW_MS = 24 * 60 * 60 * 1_000

export interface McpCredentialRequest {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
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
  /**
   * Binds a live Session credential to the Turn currently being prompted.
   * Resolution is intentionally unavailable while no Turn is active.
   */
  readonly activateTurn: (threadId: ThreadId, turnId: TurnId) => Effect.Effect<void>
  /** Clears only the matching active Turn; a stale cleanup cannot clear a newer Turn. */
  readonly deactivateTurn: (threadId: ThreadId, turnId: TurnId) => Effect.Effect<void>
  /** Refreshes the liveness lease without changing the active Turn. Returns false when absent/expired. */
  readonly touchSession: (threadId: ThreadId) => Effect.Effect<boolean>
  readonly resolve: (rawToken: string) => Effect.Effect<McpInvocationScope | undefined>
  readonly revokeSession: (threadId: ThreadId) => Effect.Effect<void>
  readonly revokeAll: Effect.Effect<void>
}

export class McpSessionRegistry extends Context.Service<
  McpSessionRegistry,
  McpSessionRegistryService
>()("@noyau/server/mcp/McpSessionRegistry") {}

interface CredentialRecord {
  readonly scope: Omit<McpInvocationScope, "turnId">
  readonly activeTurnId: TurnId | null
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
      const scope: Omit<McpInvocationScope, "turnId"> = {
        environmentId: config.environmentId,
        projectId: request.projectId,
        threadId: request.threadId,
        actorId: ActorId.make(`agent:thread:${request.threadId}`),
        capabilities: new Set(["board:read", "board:write", "thread:ask"] as const),
        issuedAt,
      }
      yield* SynchronizedRef.update(state, ({ records }) => {
        const next = new Map(pruneExpired(records, issuedAt))
        for (const [hash, record] of next) {
          if (record.scope.threadId === request.threadId) {
            next.delete(hash)
          }
        }
        next.set(tokenHash, { scope, activeTurnId: null, lastAliveAt: issuedAt })
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

  const activateTurn: McpSessionRegistryService["activateTurn"] = Effect.fn(
    "McpSessionRegistry.activateTurn",
  )(function* (threadId, turnId) {
    const timestamp = yield* currentTimeMillis
    yield* SynchronizedRef.update(state, ({ records }) => {
      const next = new Map(pruneExpired(records, timestamp))
      for (const [hash, record] of next) {
        if (record.scope.threadId === threadId) {
          next.set(hash, { ...record, activeTurnId: turnId, lastAliveAt: timestamp })
        }
      }
      return { records: next }
    })
  })

  const deactivateTurn: McpSessionRegistryService["deactivateTurn"] = Effect.fn(
    "McpSessionRegistry.deactivateTurn",
  )(function* (threadId, turnId) {
    const timestamp = yield* currentTimeMillis
    yield* SynchronizedRef.update(state, ({ records }) => {
      const next = new Map(pruneExpired(records, timestamp))
      for (const [hash, record] of next) {
        // Match the active Turn as well as the Thread. A late finalizer from
        // an older Turn must not clear the Turn that has since taken over.
        if (record.scope.threadId === threadId && record.activeTurnId === turnId) {
          next.set(hash, { ...record, activeTurnId: null, lastAliveAt: timestamp })
        }
      }
      return { records: next }
    })
  })

  const touchSession: McpSessionRegistryService["touchSession"] = Effect.fn(
    "McpSessionRegistry.touchSession",
  )(function* (threadId) {
    const timestamp = yield* currentTimeMillis
    return yield* SynchronizedRef.modify(state, ({ records }) => {
      const current = pruneExpired(records, timestamp)
      const next = new Map(current)
      let refreshed = false
      for (const [hash, record] of next) {
        if (record.scope.threadId === threadId) {
          next.set(hash, { ...record, lastAliveAt: timestamp })
          refreshed = true
        }
      }
      return [refreshed, { records: next }] as const
    })
  })

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
        if (record === undefined || record.activeTurnId === null) {
          return [undefined, { records: current }] as const
        }
        const next = new Map(current)
        next.set(tokenHash, { ...record, lastAliveAt: timestamp })
        return [{ ...record.scope, turnId: record.activeTurnId }, { records: next }] as const
      })
    },
  )

  const revokeSession: McpSessionRegistryService["revokeSession"] = Effect.fn(
    "McpSessionRegistry.revokeSession",
  )(function* (threadId) {
    yield* SynchronizedRef.update(state, ({ records }) => ({
      records: new Map(
        Array.from(records).filter(([, record]) => record.scope.threadId !== threadId),
      ),
    }))
  })

  return McpSessionRegistry.of({
    issue,
    activateTurn,
    deactivateTurn,
    touchSession,
    resolve,
    revokeSession,
    revokeAll: SynchronizedRef.set(state, { records: new Map() }),
  })
})

export const mcpSessionRegistryLayer = Layer.effect(McpSessionRegistry, makeMcpSessionRegistry())
