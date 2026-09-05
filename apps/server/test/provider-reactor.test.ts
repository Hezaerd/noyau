import { createHash } from "node:crypto"

import { assert, describe, it } from "@effect/vitest"
import { ProviderInstanceId, WorkspaceRoot } from "@noyau/contracts/entities/environment"
import type { DomainEvent } from "@noyau/contracts/events"
import { ActorId, ProjectId, ProviderSessionId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ProjectCreated } from "@noyau/contracts/project/events"
import {
  ThreadCreated,
  ThreadForkRequested,
  ThreadProviderHandedOff,
  ThreadSessionSet,
  ThreadTurnEnded,
  ThreadTurnStarted,
} from "@noyau/contracts/thread/events"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { projectDomainEvent } from "@noyau/server/persistence/projections"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import {
  emptyProviderStatuses,
  ProviderPort,
  type ProviderEmit,
  type ProviderForkInput,
  type ProviderPortService,
  type ProviderTurnInput,
} from "@noyau/server/provider/provider-port"
import { makeProviderReactor, type DispatchInternal } from "@noyau/server/provider/provider-reactor"
import { Cause, Context, Crypto, Effect, Exit, Layer, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { stubGitRuntimeLayer, testServerConfigLayer } from "./fixtures.ts"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const firstTurnId = TurnId.make("30000000-0000-4000-8000-000000000001")
const handoffTurnId = TurnId.make("30000000-0000-4000-8000-000000000002")
const chainedHandoffTurnId = TurnId.make("30000000-0000-4000-8000-000000000003")
const resumedTurnId = TurnId.make("30000000-0000-4000-8000-000000000004")
const forkThreadId = ThreadId.make("20000000-0000-4000-8000-000000000004")
const missingThreadId = ThreadId.make("20000000-0000-4000-8000-000000000005")
const nullModelThreadId = ThreadId.make("20000000-0000-4000-8000-000000000006")
const actorId = ActorId.make("human:test")

const occurredAt = Schema.decodeSync(Schema.DateTimeUtcFromString)("2026-09-01T12:00:00.000Z")
const persisted = (sequence: number, event: DomainEvent): PersistedEvent<DomainEvent> => ({
  eventId: `60000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
  sequence,
  projectId,
  actorId,
  correlationId: "40000000-0000-4000-8000-000000000001",
  causationId: "50000000-0000-4000-8000-000000000001",
  occurredAt,
  schemaVersion: 1,
  aggregate: { kind: "project", id: projectId },
  aggregateVersion: sequence,
  event,
})

const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (algorithm, data) =>
    Effect.succeed(
      new Uint8Array(createHash(algorithm.toLowerCase().replace("-", "")).update(data).digest()),
    ),
})

describe("provider handoff reactor", () => {
  it.effect("bridges a requested fork to the provider with its durable exact boundary", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const forks: Array<ProviderForkInput> = []
        const dispatched: Array<Parameters<DispatchInternal>[0]> = []
        const provider: ProviderPortService = {
          status: Effect.succeed(emptyProviderStatuses),
          listSkills: () => Effect.succeed([]),
          startTurn: () => Effect.void,
          fork: (input) =>
            Effect.sync(() => {
              forks.push(input)
              return {
                schemaVersion: 1 as const,
                sessionId: ProviderSessionId.make("forked-codex"),
              }
            }),
          interrupt: () => Effect.void,
          stop: () => Effect.void,
          reapIdle: () => Effect.succeed(false),
          stopAll: Effect.void,
          respondApproval: () => Effect.void,
          respondUserInput: () => Effect.void,
          reserveUserInput: () => Effect.succeed(false),
          releaseUserInput: () => Effect.void,
          drain: Effect.void,
        }
        const services = yield* Layer.build(
          Layer.mergeAll(
            memoryLayer,
            stubGitRuntimeLayer,
            testServerConfigLayer(),
            Layer.succeed(ProviderPort)(provider),
            Layer.succeed(Crypto.Crypto)(testCrypto),
          ),
        )
        const sql = Context.get(services, SqlClient)
        const reactor = yield* makeProviderReactor(
          (command) => Effect.sync(() => dispatched.push(command)),
          () => Effect.succeed([]),
        ).pipe(Effect.provide(services))
        const sourceSession = {
          threadId,
          status: "ready" as const,
          lastError: null,
          activeTurnId: null,
          runtimeMode: "full-access" as const,
          resumeCursor: {
            schemaVersion: 1 as const,
            sessionId: ProviderSessionId.make("source-codex"),
          },
          updatedAt: occurredAt,
        }
        const events = [
          persisted(
            1,
            ProjectCreated.make({
              projectId,
              name: "Noyau",
              workspaceRoot: WorkspaceRoot.make("/workspace"),
            }),
          ),
          persisted(
            2,
            ThreadCreated.make({
              threadId,
              projectId,
              title: "Source",
              provider: ProviderInstanceId.make("codex"),
              runtimeMode: "full-access",
            }),
          ),
          persisted(
            3,
            ThreadTurnStarted.make({ threadId, turnId: firstTurnId, text: "Fork here" }),
          ),
          persisted(
            4,
            ThreadTurnEnded.make({
              threadId,
              turnId: firstTurnId,
              state: "completed",
              providerForkPoint: { schemaVersion: 1, boundaryId: "provider-turn-1" },
            }),
          ),
          persisted(5, ThreadSessionSet.make({ threadId, session: sourceSession })),
          persisted(
            6,
            ThreadForkRequested.make({
              threadId: forkThreadId,
              sourceThreadId: threadId,
              sourceTurnId: firstTurnId,
            }),
          ),
        ]
        for (const event of events)
          yield* projectDomainEvent(event).pipe(Effect.provideService(SqlClient, sql))
        yield* reactor(events.at(-1)!)
        assert.deepStrictEqual(forks, [
          {
            projectId,
            threadId: forkThreadId,
            sourceThreadId: threadId,
            sourceTurnId: firstTurnId,
            provider: ProviderInstanceId.make("codex"),
            workspaceRoot: "/workspace",
            sourceResumeCursor: sourceSession.resumeCursor,
            sourceForkPoint: { schemaVersion: 1, boundaryId: "provider-turn-1" },
          },
        ])
        assert.strictEqual(dispatched[0]?._tag, "thread.fork.complete")
        assert.deepStrictEqual(dispatched[0]?.payload, {
          threadId: forkThreadId,
          sourceThreadId: threadId,
          sourceTurnId: firstTurnId,
          resumeCursor: { schemaVersion: 1, sessionId: ProviderSessionId.make("forked-codex") },
          providerForkPoint: { schemaVersion: 1, boundaryId: "provider-turn-1" },
        })
      }),
    ),
  )

  it.effect("stops the old runtime and ignores its stale terminal signal", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started: Array<ProviderTurnInput> = []
        const dispatched: Array<Parameters<DispatchInternal>[0]> = []
        let stops = 0
        let oldEmit: ProviderEmit | undefined
        const provider: ProviderPortService = {
          status: Effect.succeed(emptyProviderStatuses),
          listSkills: () => Effect.succeed([]),
          startTurn: (input, emit) =>
            Effect.sync(() => {
              started.push(input)
              if (input.turnId === firstTurnId) oldEmit = emit
            }),
          interrupt: () => Effect.void,
          stop: () =>
            Effect.gen(function* () {
              stops += 1
              if (oldEmit !== undefined) {
                yield* oldEmit({
                  _tag: "session",
                  threadId,
                  turnId: firstTurnId,
                  status: "stopped",
                  resumeCursor: {
                    schemaVersion: 1,
                    sessionId: ProviderSessionId.make("cursor-session-old"),
                  },
                })
              }
            }),
          reapIdle: () => Effect.succeed(false),
          stopAll: Effect.void,
          respondApproval: () => Effect.void,
          respondUserInput: () => Effect.void,
          reserveUserInput: () => Effect.succeed(false),
          releaseUserInput: () => Effect.void,
          drain: Effect.void,
        }
        const services = yield* Layer.build(
          Layer.mergeAll(
            memoryLayer,
            stubGitRuntimeLayer,
            testServerConfigLayer(),
            Layer.succeed(ProviderPort)(provider),
            Layer.succeed(Crypto.Crypto)(testCrypto),
          ),
        )
        const sql = Context.get(services, SqlClient)
        const queries: Array<string> = []
        const recordingSql = new Proxy(sql, {
          apply: (target, _thisArg, args: Parameters<typeof sql>) => {
            queries.push(args[0])
            return target(...args)
          },
        })
        const reactor = yield* makeProviderReactor(
          (command) =>
            Effect.sync(() => {
              dispatched.push(command)
            }),
          () => Effect.succeed([]),
        ).pipe(Effect.provide(Context.add(services, SqlClient, recordingSql)))
        const project = persisted(
          1,
          ProjectCreated.make({
            projectId,
            name: "Noyau",
            workspaceRoot: WorkspaceRoot.make("/workspace"),
          }),
        )
        const created = persisted(
          2,
          ThreadCreated.make({
            threadId,
            projectId,
            title: "Provider handoff",
            provider: ProviderInstanceId.make("cursor"),
            runtimeMode: "full-access",
            modelSelection: {
              modelId: "composer-2.5",
              reasoningEffort: "high",
              serviceTier: "fast",
              thinking: false,
            },
          }),
        )
        const firstTurn = persisted(
          3,
          ThreadTurnStarted.make({
            threadId,
            turnId: firstTurnId,
            text: "Implement the feature",
          }),
        )
        for (const event of [project, created, firstTurn]) {
          yield* projectDomainEvent(event).pipe(Effect.provideService(SqlClient, sql))
        }
        yield* reactor(firstTurn)
        assert.deepStrictEqual(started[0]?.modelSelection, {
          modelId: "composer-2.5",
          reasoningEffort: "high",
          serviceTier: "fast",
          thinking: false,
        })

        const handedOff = persisted(
          4,
          ThreadProviderHandedOff.make({
            threadId,
            previousProvider: ProviderInstanceId.make("cursor"),
            provider: ProviderInstanceId.make("claude"),
            previousModelSelection: { modelId: "composer-2.5" },
            modelSelection: { modelId: "claude-sonnet-4-5" },
          }),
        )
        const nextTurn = persisted(
          5,
          ThreadTurnStarted.make({
            threadId,
            turnId: handoffTurnId,
            text: "Review it critically",
            providerHandoff: {
              previousProvider: ProviderInstanceId.make("cursor"),
              provider: ProviderInstanceId.make("claude"),
              previousModelSelection: { modelId: "composer-2.5" },
              modelSelection: { modelId: "claude-sonnet-4-5" },
            },
          }),
        )
        for (const event of [handedOff, nextTurn]) {
          yield* projectDomainEvent(event).pipe(Effect.provideService(SqlClient, sql))
          yield* reactor(event)
        }

        assert.strictEqual(stops, 1)
        assert.strictEqual(dispatched.length, 0)
        assert.strictEqual(started.length, 2)
        assert.strictEqual(started[1]?.provider, "claude")
        assert.deepStrictEqual(started[1]?.modelSelection, {
          modelId: "claude-sonnet-4-5",
        })
        assert.strictEqual(started[1]?.resumeCursor, null)
        assert.match(
          started[1]?.text ?? "",
          /Model transition: 'composer-2.5' -> 'claude-sonnet-4-5'/,
        )
        assert.match(started[1]?.text ?? "", /Prior transcript/)
        assert.match(started[1]?.text ?? "", /Implement the feature/)
        assert.match(started[1]?.text ?? "", /Review it critically/)

        const handedBack = persisted(
          6,
          ThreadProviderHandedOff.make({
            threadId,
            previousProvider: ProviderInstanceId.make("claude"),
            provider: ProviderInstanceId.make("cursor"),
            previousModelSelection: { modelId: "claude-sonnet-4-5" },
            modelSelection: { modelId: "grok-4.6" },
          }),
        )
        const chainedTurn = persisted(
          7,
          ThreadTurnStarted.make({
            threadId,
            turnId: chainedHandoffTurnId,
            text: "Continue with Cursor",
            providerHandoff: {
              previousProvider: ProviderInstanceId.make("claude"),
              provider: ProviderInstanceId.make("cursor"),
              previousModelSelection: { modelId: "claude-sonnet-4-5" },
              modelSelection: { modelId: "grok-4.6" },
            },
          }),
        )
        for (const event of [handedBack, chainedTurn]) {
          yield* projectDomainEvent(event).pipe(Effect.provideService(SqlClient, sql))
          yield* reactor(event)
        }

        assert.strictEqual(stops, 2)
        assert.strictEqual(started.length, 3)
        assert.strictEqual(started[2]?.provider, "cursor")
        assert.deepStrictEqual(started[2]?.modelSelection, { modelId: "grok-4.6" })
        assert.strictEqual(started[2]?.resumeCursor, null)
        assert.match(started[2]?.text ?? "", /Model transition: 'claude-sonnet-4-5' -> 'grok-4.6'/)
        assert.match(started[2]?.text ?? "", /Review it critically/)
        assert.match(started[2]?.text ?? "", /Continue with Cursor/)

        const resumedCursor = {
          schemaVersion: 1 as const,
          sessionId: ProviderSessionId.make("cursor-session-resumed"),
        }
        const resumedSession = persisted(
          8,
          ThreadSessionSet.make({
            threadId,
            session: {
              threadId,
              status: "ready",
              lastError: null,
              activeTurnId: null,
              runtimeMode: "full-access",
              resumeCursor: resumedCursor,
              updatedAt: occurredAt,
            },
          }),
        )
        const resumedTurn = persisted(
          9,
          ThreadTurnStarted.make({
            threadId,
            turnId: resumedTurnId,
            text: "Use the live session",
          }),
        )
        for (const event of [resumedSession, resumedTurn]) {
          yield* projectDomainEvent(event).pipe(Effect.provideService(SqlClient, sql))
        }

        queries.length = 0
        yield* reactor(resumedTurn)
        assert.strictEqual(started.length, 4)
        assert.strictEqual(started[3]?.text, "Use the live session")
        assert.deepStrictEqual(started[3]?.resumeCursor, resumedCursor)
        const resumedQueries = queries.join("\n")
        assert.notMatch(resumedQueries, /projection_transcript/)
        assert.notMatch(resumedQueries, /projection_inherited_transcript/)
        assert.notMatch(resumedQueries, /projection_turns/)

        const nullModelCreated = persisted(
          10,
          ThreadCreated.make({
            threadId: nullModelThreadId,
            projectId,
            title: "No model selected",
            provider: ProviderInstanceId.make("codex"),
            runtimeMode: "full-access",
          }),
        )
        const priorMandate = persisted(
          11,
          ThreadTurnStarted.make({
            threadId: nullModelThreadId,
            turnId: TurnId.make("30000000-0000-4000-8000-000000000006"),
            text: "Keep this exact mandate",
          }),
        )
        const resumeWithoutSession = persisted(
          12,
          ThreadTurnStarted.make({
            threadId: nullModelThreadId,
            turnId: TurnId.make("30000000-0000-4000-8000-000000000007"),
            text: "continue",
          }),
        )
        for (const event of [nullModelCreated, priorMandate]) {
          yield* projectDomainEvent(event).pipe(Effect.provideService(SqlClient, sql))
        }
        yield* reactor(priorMandate)
        yield* projectDomainEvent(resumeWithoutSession).pipe(Effect.provideService(SqlClient, sql))
        yield* reactor(resumeWithoutSession)
        assert.strictEqual(started[5]?.text, "Keep this exact mandate")
        assert.strictEqual(started[5]?.modelSelection, null)
        assert.strictEqual(started[5]?.resumeCursor, null)

        const missing = persisted(
          13,
          ThreadTurnStarted.make({
            threadId: missingThreadId,
            turnId: TurnId.make("30000000-0000-4000-8000-000000000005"),
            text: "Missing",
          }),
        )
        const missingExit = yield* Effect.exit(reactor(missing))
        assert.isTrue(Exit.isFailure(missingExit))
        if (Exit.isFailure(missingExit)) {
          assert.match(Cause.pretty(missingExit.cause), /projection is missing/)
        }
      }),
    ),
  )
})
