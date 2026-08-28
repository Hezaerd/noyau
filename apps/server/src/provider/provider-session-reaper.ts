import { ThreadId } from "@noyau/contracts/ids"
import { Clock, Duration, Effect, Fiber, Schedule, Schema } from "effect"
import type { Scope } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { ProviderPort } from "./provider-port.ts"

const DEFAULT_INACTIVITY_THRESHOLD_MS = 30 * 60 * 1_000
const DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1_000

const SessionRow = Schema.Struct({
  thread_id: Schema.String,
  status: Schema.String,
  active_turn_id: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
})
type SessionRow = (typeof SessionRow)["Type"]
const decodeSessionRow = Schema.decodeUnknownEffect(SessionRow)

export interface ProviderSessionReaperOptions {
  readonly inactivityThresholdMs?: number
  readonly sweepIntervalMs?: number
  /** Injectable wall clock for deterministic tests; production uses Effect's Clock service. */
  readonly now?: () => number
}

export interface ProviderSessionReaperService {
  readonly start: Effect.Effect<void, never, Scope.Scope>
  readonly stop: Effect.Effect<void>
  readonly sweep: Effect.Effect<number>
}

const reapableStatuses: ReadonlySet<string> = new Set(["idle", "ready", "interrupted"])

const sessionCanBeReaped = (row: SessionRow) =>
  row.active_turn_id === null && reapableStatuses.has(row.status)

/**
 * Owns the background lifecycle policy for provider runtimes.
 *
 * The durable projection is only used to discover candidates. The ProviderPort remains the sole
 * authority allowed to close a runtime, so the reaper never scans the process table or kills by
 * executable name.
 */
export const makeProviderSessionReaper = Effect.fn("ProviderSessionReaper.make")(function* (
  options: ProviderSessionReaperOptions = {},
) {
  const provider = yield* ProviderPort
  const sql = yield* SqlClient
  const inactivityThresholdMs = Math.max(
    1,
    options.inactivityThresholdMs ?? DEFAULT_INACTIVITY_THRESHOLD_MS,
  )
  const sweepIntervalMs = Math.max(1, options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS)
  const currentTimeMillis = options.now ? Effect.sync(options.now) : Clock.currentTimeMillis
  let fiber: Fiber.Fiber<void> | undefined

  const listSessions = Effect.gen(function* () {
    const rows = yield* sql<ReadonlyArray<(typeof SessionRow)["Encoded"]>>`
      SELECT thread_id, status, active_turn_id, updated_at
      FROM projection_sessions
    `.pipe(Effect.orDie)
    return yield* Effect.forEach(rows, (row) => decodeSessionRow(row).pipe(Effect.orDie))
  })

  const reapOne = Effect.fn("ProviderSessionReaper.reapOne")(function* (row: SessionRow) {
    return yield* provider.reapIdle(ThreadId.make(row.thread_id)).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("provider.session.reaper.reap-failed", {
          threadId: row.thread_id,
          cause,
        }).pipe(Effect.as(false)),
      ),
    )
  })

  const sweep = Effect.gen(function* () {
    const now = yield* currentTimeMillis
    const sessions = yield* listSessions
    let reaped = 0
    for (const session of sessions) {
      if (!sessionCanBeReaped(session)) {
        continue
      }
      const updatedAt = Date.parse(session.updated_at)
      if (!Number.isFinite(updatedAt) || now - updatedAt < inactivityThresholdMs) {
        continue
      }
      if (yield* reapOne(session)) {
        reaped += 1
      }
    }
    if (reaped > 0) {
      yield* Effect.logInfo("provider.session.reaper.sweep-complete", {
        reapedCount: reaped,
        totalSessions: sessions.length,
        inactivityThresholdMs,
      })
    }
    return reaped
  })

  const stop = Effect.gen(function* () {
    const running = fiber
    fiber = undefined
    if (running !== undefined) {
      yield* Fiber.interrupt(running)
    }
  })

  const start = Effect.gen(function* () {
    if (fiber !== undefined) {
      return
    }
    const loop = sweep.pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("provider.session.reaper.sweep-failed", { cause }).pipe(Effect.as(0)),
      ),
      Effect.repeat(Schedule.spaced(Duration.millis(sweepIntervalMs))),
      Effect.asVoid,
    )
    fiber = yield* Effect.forkScoped(loop)
    yield* Effect.logInfo("provider.session.reaper.started", {
      inactivityThresholdMs,
      sweepIntervalMs,
    })
  })

  return { start, stop, sweep }
})

export const providerSessionReaperDefaults = {
  inactivityThresholdMs: DEFAULT_INACTIVITY_THRESHOLD_MS,
  sweepIntervalMs: DEFAULT_SWEEP_INTERVAL_MS,
} as const
