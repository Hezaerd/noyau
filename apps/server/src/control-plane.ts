import { makeCommandWorker, type PersistedEvent } from "@noyau/database/command-worker"
import { makeDrainableWorker } from "@noyau/database/drainable-worker"
import { projectDomainEvent } from "@noyau/database/projections"
import { readBoardSnapshot, readShellSnapshot, readThreadSnapshot } from "@noyau/database/snapshots"
import { decide as decideBoard } from "@noyau/domain/board/decider"
import {
  emptyBoardState,
  evolve as evolveBoard,
  type BoardState,
  withProjectThreads,
} from "@noyau/domain/board/projector"
import { decide as decideProject } from "@noyau/domain/project/decider"
import {
  emptyProjectCatalog,
  evolve as evolveProject,
  type ProjectCatalog,
} from "@noyau/domain/project/projector"
import { decide as decideThread } from "@noyau/domain/thread/decider"
import {
  emptyThreadState,
  evolve as evolveThread,
  type ThreadState,
  withAvailableProjects,
} from "@noyau/domain/thread/projector"
import type { ClientCommandRequest, Command as CommandType } from "@noyau/protocol/commands"
import { Command } from "@noyau/protocol/commands"
import { Environment } from "@noyau/protocol/entities/environment"
import type { CommandIdConflict } from "@noyau/protocol/errors"
import { ServiceUnavailable } from "@noyau/protocol/errors"
import {
  decodeEventEnvelope,
  DomainEvent,
  type DomainEvent as DomainEventType,
} from "@noyau/protocol/events"
import {
  type ActorId,
  CorrelationId,
  ProjectId,
  type ProjectId as ProjectIdType,
  Sequence,
  type Sequence as SequenceType,
  type ThreadId,
} from "@noyau/protocol/ids"
import { ProjectCommand } from "@noyau/protocol/project/commands"
import { ProjectEvent } from "@noyau/protocol/project/events"
import {
  type DispatchResult,
  Rejection,
  type Rejection as RejectionType,
} from "@noyau/protocol/receipts"
import {
  requiresFreshSnapshot,
  type ProjectStreamItem,
  type ServerConfig as PublicServerConfig,
  type ShellStreamItem,
  type SubscribeProjectInput,
  type SubscribeShellInput,
  type SubscribeThreadInput,
  type ThreadStreamItem,
} from "@noyau/protocol/rpc"
import type { ShellLiveEvent, ShellSnapshot } from "@noyau/protocol/shell"
import { ThreadCommand } from "@noyau/protocol/thread/commands"
import { ThreadEvent, type ThreadEvent as ThreadEventType } from "@noyau/protocol/thread/events"
import { TicketCommand } from "@noyau/protocol/ticket/commands"
import { TicketEvent } from "@noyau/protocol/ticket/events"
import {
  Context,
  DateTime,
  Duration,
  Effect,
  Layer,
  Option,
  Queue,
  type Result,
  Schema,
  Stream,
} from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import type { SqlError } from "effect/unstable/sql/SqlError"

import { ServerConfig } from "./config"
import { ProviderPort } from "./provider/provider-port"
import { makeProviderReactor, type DispatchInternal } from "./provider/provider-reactor"

interface ControlState {
  readonly projects: ProjectCatalog
  readonly board: BoardState
  readonly threads: ThreadState
}

const emptyControlState: ControlState = {
  projects: emptyProjectCatalog,
  board: emptyBoardState,
  threads: emptyThreadState,
}

const isProjectCommand = Schema.is(ProjectCommand)
const isTicketCommand = Schema.is(TicketCommand)
const isThreadCommand = Schema.is(ThreadCommand)
const isProjectEvent = Schema.is(ProjectEvent)
const isTicketEvent = Schema.is(TicketEvent)
const isThreadEvent = Schema.is(ThreadEvent)

const decide = (
  state: ControlState,
  command: CommandType,
): Result.Result<ReadonlyArray<DomainEventType>, RejectionType> => {
  if (isProjectCommand(command)) {
    return decideProject(state.projects, command)
  }
  if (isTicketCommand(command)) {
    return decideBoard(state.board, command)
  }
  return decideThread(
    state.threads,
    isThreadCommand(command) ? command : Schema.decodeSync(ThreadCommand)(command),
  )
}

const evolve = (state: ControlState, event: DomainEventType): ControlState => {
  const projects = isProjectEvent(event) ? evolveProject(state.projects, event) : state.projects
  const board = isTicketEvent(event) ? evolveBoard(state.board, event) : state.board
  const threads = isThreadEvent(event) ? evolveThread(state.threads, event) : state.threads
  const availableProjectIds = projects.projects.map((project) => project.projectId)
  const projectThreadIds = threads.threads.map((thread) => thread.threadId)
  return {
    projects,
    board: withProjectThreads(board, projectThreadIds),
    threads: withAvailableProjects(threads, availableProjectIds),
  }
}

const ScopeRow = Schema.Struct({ project_id: Schema.String })
const MigrationRow = Schema.Struct({ migration_id: Schema.Int })
const decodeScopeRow = Schema.decodeEffect(ScopeRow)
const decodeMigrationRow = Schema.decodeEffect(MigrationRow)
const decodeCommand = Schema.decodeUnknownEffect(Command)

const fallbackProjectId = (id: string): ProjectIdType => ProjectId.make(id)

const projectForTicket = Effect.fn("ControlPlane.projectForTicket")(function* (ticketId: string) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof ScopeRow)["Encoded"]
  >`SELECT project_id FROM projection_tickets WHERE ticket_id = ${ticketId}`
  const row = rows[0]
  return row === undefined
    ? fallbackProjectId(ticketId)
    : ProjectId.make((yield* decodeScopeRow(row).pipe(Effect.orDie)).project_id)
})

const projectForColumn = Effect.fn("ControlPlane.projectForColumn")(function* (columnId: string) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof ScopeRow)["Encoded"]
  >`SELECT project_id FROM projection_columns WHERE column_id = ${columnId}`
  const row = rows[0]
  return row === undefined
    ? fallbackProjectId(columnId)
    : ProjectId.make((yield* decodeScopeRow(row).pipe(Effect.orDie)).project_id)
})

const projectForThread = Effect.fn("ControlPlane.projectForThread")(function* (threadId: string) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof ScopeRow)["Encoded"]
  >`SELECT project_id FROM projection_threads WHERE thread_id = ${threadId}`
  const row = rows[0]
  return row === undefined
    ? fallbackProjectId(threadId)
    : ProjectId.make((yield* decodeScopeRow(row).pipe(Effect.orDie)).project_id)
})

const requestProjectId = Effect.fn("ControlPlane.requestProjectId")(function* (
  request: ClientCommandRequest,
) {
  switch (request._tag) {
    case "project.create":
    case "project.meta.update":
    case "project.rebind":
    case "project.delete":
    case "ticket.create":
    case "thread.create":
      return request.payload.projectId
    case "kanbanColumn.create":
      return request.payload.projectId
    case "kanbanColumn.update":
    case "kanbanColumn.move":
    case "kanbanColumn.delete":
      return yield* projectForColumn(request.payload.columnId)
    case "ticket.move":
    case "ticket.complete":
    case "ticket.reopen":
    case "ticket.archive":
    case "ticket.restore":
    case "ticket.assign":
    case "ticket.update":
    case "ticket.dependency.add":
    case "ticket.dependency.remove":
    case "ticket.thread.link":
    case "ticket.thread.unlink":
      return yield* projectForTicket(request.payload.ticketId)
    case "thread.archive":
    case "thread.restore":
    case "thread.meta.update":
    case "thread.runtime-mode.set":
    case "thread.turn.start":
    case "thread.turn.interrupt":
    case "approval.respond":
    case "user-input.respond":
    case "session.stop":
      return yield* projectForThread(request.payload.threadId)
  }
})

const enrichCommand = Effect.fn("ControlPlane.enrichCommand")(function* (
  request: ClientCommandRequest,
  actorId: ActorId,
) {
  const projectId = yield* requestProjectId(request)
  const issuedAt = yield* DateTime.now
  return yield* decodeCommand({
    ...request,
    projectId,
    actorId,
    correlationId: CorrelationId.make(request.commandId),
    issuedAt: DateTime.formatIso(issuedAt),
    schemaVersion: 1,
  }).pipe(Effect.orDie)
})

const toEnvelope = (event: PersistedEvent<DomainEventType>) =>
  decodeEventEnvelope({
    eventId: event.eventId,
    sequence: event.sequence,
    projectId: event.projectId,
    actorId: event.actorId,
    correlationId: event.correlationId,
    causationId: event.causationId,
    occurredAt: DateTime.formatIso(event.occurredAt),
    schemaVersion: event.schemaVersion,
    event: event.event,
  }).pipe(Effect.orDie)

const unavailable = (service: string) => (_error: SqlError | Schema.SchemaError) =>
  new ServiceUnavailable({ service })

type LiveInput =
  | { readonly kind: "event"; readonly event: PersistedEvent<DomainEventType> }
  | { readonly kind: "synchronized" }

const makeLiveBuffer = Effect.fn("ControlPlane.makeLiveBuffer")(function* (
  events: Stream.Stream<PersistedEvent<DomainEventType>>,
) {
  const buffer = yield* Queue.unbounded<LiveInput>()
  yield* Effect.forkScoped(
    events.pipe(Stream.runForEach((event) => Queue.offer(buffer, { kind: "event", event }))),
    { startImmediately: true },
  )
  return buffer
})

const eventSequence = (item: LiveInput): number =>
  item.kind === "event" ? item.event.sequence : Number.MAX_SAFE_INTEGER

const bufferedTail = <A, E = never, R = never>(
  buffer: Queue.Dequeue<LiveInput> & Queue.Enqueue<LiveInput>,
  boundary: number,
  requestCompletionMarker: boolean | undefined,
  mapEvent: (event: PersistedEvent<DomainEventType>) => Effect.Effect<ReadonlyArray<A>, E, R>,
  synchronized: A,
) => {
  const stream = Stream.fromQueue(buffer).pipe(
    Stream.mapEffect((item): Effect.Effect<ReadonlyArray<A>, E, R> => {
      if (item.kind === "synchronized") {
        return Effect.succeed([synchronized])
      }
      if (eventSequence(item) <= boundary) {
        return Effect.succeed([])
      }
      return mapEvent(item.event)
    }),
    Stream.flatMap((items) => Stream.fromIterable(items)),
  )
  return requestCompletionMarker === true
    ? Stream.concat(
        Stream.fromEffect(Queue.offer(buffer, { kind: "synchronized" })).pipe(Stream.drain),
        stream,
      )
    : stream
}

const threadIdOf = (event: ThreadEventType): ThreadId =>
  event._tag === "thread.transcript-appended" ? event.item.threadId : event.threadId

const isProjectStreamEvent = (event: DomainEventType): boolean =>
  isProjectEvent(event) || isTicketEvent(event)

const readSchemaVersion = Effect.fn("ControlPlane.readSchemaVersion")(function* () {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof MigrationRow)["Encoded"]
  >`SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id DESC LIMIT 1`
  const row = rows[0]
  return row === undefined ? 0 : (yield* decodeMigrationRow(row).pipe(Effect.orDie)).migration_id
})

const shellLiveEvent = Effect.fn("ControlPlane.shellLiveEvent")(function* (
  environment: Environment,
  persisted: PersistedEvent<DomainEventType>,
) {
  const event = persisted.event
  if (isProjectEvent(event)) {
    if (event._tag === "project.deleted") {
      return [
        {
          _tag: "project-removed",
          sequence: Sequence.make(persisted.sequence),
          projectId: event.projectId,
        } satisfies ShellLiveEvent,
      ]
    }
    const snapshot = yield* readShellSnapshot(environment)
    const project = snapshot.projects.find((candidate) => candidate.id === persisted.projectId)
    return project === undefined
      ? []
      : [
          {
            _tag: "project-upserted",
            sequence: Sequence.make(persisted.sequence),
            project,
          } satisfies ShellLiveEvent,
        ]
  }
  if (isThreadEvent(event)) {
    const snapshot = yield* readShellSnapshot(environment)
    const threadId = threadIdOf(event)
    const thread = snapshot.threads.find((candidate) => candidate.id === threadId)
    return thread === undefined
      ? [
          {
            _tag: "thread-removed",
            sequence: Sequence.make(persisted.sequence),
            threadId,
          } satisfies ShellLiveEvent,
        ]
      : [
          {
            _tag: "thread-upserted",
            sequence: Sequence.make(persisted.sequence),
            thread,
          } satisfies ShellLiveEvent,
        ]
  }
  return []
})

const coalesceShellItems = (
  items: ReadonlyArray<ShellStreamItem>,
): ReadonlyArray<ShellStreamItem> => {
  const latest = new Map<string, Extract<ShellStreamItem, { readonly kind: "event" }>>()
  let synchronized = false
  for (const item of items) {
    if (item.kind === "synchronized") {
      synchronized = true
      continue
    }
    if (item.kind !== "event") {
      continue
    }
    const event = item.event
    const key =
      event._tag === "project-upserted" || event._tag === "project-removed"
        ? `project:${event._tag === "project-upserted" ? event.project.id : event.projectId}`
        : `thread:${event._tag === "thread-upserted" ? event.thread.id : event.threadId}`
    latest.set(key, item)
  }
  const output: Array<ShellStreamItem> = [...latest.values()].toSorted(
    (left, right) => left.event.sequence - right.event.sequence,
  )
  if (synchronized) {
    output.push({ kind: "synchronized" })
  }
  return output
}

const coalesceShell = <E, R>(stream: Stream.Stream<ShellStreamItem, E, R>) =>
  stream.pipe(
    Stream.groupedWithin(256, Duration.millis(25)),
    Stream.flatMap((items) => Stream.fromIterable(coalesceShellItems(items))),
  )

export interface ControlPlaneService {
  readonly dispatch: (
    request: ClientCommandRequest,
    actorId: ActorId,
  ) => Effect.Effect<DispatchResult, RejectionType | CommandIdConflict | ServiceUnavailable>
  readonly subscribeShell: (
    input: SubscribeShellInput,
  ) => Stream.Stream<ShellStreamItem, ServiceUnavailable>
  readonly subscribeProject: (
    input: SubscribeProjectInput,
  ) => Stream.Stream<ProjectStreamItem, ServiceUnavailable>
  readonly subscribeThread: (
    input: SubscribeThreadInput,
  ) => Stream.Stream<ThreadStreamItem, ServiceUnavailable>
  readonly getConfig: Effect.Effect<PublicServerConfig, ServiceUnavailable>
  readonly probe: Effect.Effect<Record<never, never>>
  readonly drainReactors: Effect.Effect<void>
}

export class ControlPlane extends Context.Service<ControlPlane, ControlPlaneService>()(
  "@noyau/server/ControlPlane",
) {}

export interface ControlPlaneHooks {
  readonly beforeProjectCatchUp?: (headSequence: SequenceType) => Effect.Effect<void>
  readonly afterShellSnapshot?: (snapshotSequence: SequenceType) => Effect.Effect<void>
  readonly afterProjectSnapshot?: (snapshotSequence: SequenceType) => Effect.Effect<void>
  readonly afterThreadSnapshot?: (snapshotSequence: SequenceType) => Effect.Effect<void>
}

export const makeControlPlaneLayer = (hooks: ControlPlaneHooks = {}) =>
  Layer.effect(
    ControlPlane,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      const sql = yield* SqlClient
      const provider = yield* ProviderPort
      let dispatchInternal: DispatchInternal = (_command) =>
        Effect.die("Provider reactor dispatched before the command worker was ready")
      const processProviderEvent = yield* makeProviderReactor((command) =>
        dispatchInternal(command),
      ).pipe(
        Effect.provideService(ProviderPort, provider),
        Effect.provideService(SqlClient, sql),
      )
      const reactor = yield* makeDrainableWorker(processProviderEvent)
      const worker = yield* makeCommandWorker({
        commandSchema: Command,
        eventSchema: DomainEvent,
        rejectionSchema: Rejection,
        metadata: (command) => command,
        aggregate: (command) => ({ kind: "project", id: command.projectId }),
        initialState: () => emptyControlState,
        decide,
        evolve,
        project: (event) => projectDomainEvent(event).pipe(Effect.provideService(SqlClient, sql)),
        reactor,
      })
      dispatchInternal = (command) =>
        worker.dispatch(command).pipe(
          Effect.flatMap((receipt) =>
            receipt.response._tag === "accepted"
              ? Effect.void
              : Effect.fail(receipt.response.error),
          ),
        )
      const cursorStatus = yield* provider.status
      const environment = new Environment({
        id: config.environmentId,
        cursor: cursorStatus,
        createdAt: config.environmentCreatedAt,
      })

      const dispatch: ControlPlaneService["dispatch"] = Effect.fn("ControlPlane.dispatch")(
        function* (request, actorId) {
          const command = yield* enrichCommand(request, actorId).pipe(
            Effect.provideService(SqlClient, sql),
            Effect.mapError(unavailable("sqlite")),
          )
          const receipt = yield* worker
            .dispatch(command)
            .pipe(
              Effect.mapError((error) =>
                error._tag === "CommandIdConflict"
                  ? error
                  : new ServiceUnavailable({ service: "sqlite" }),
              ),
            )
          return receipt.response._tag === "accepted"
            ? { sequence: Sequence.make(receipt.response.sequence) }
            : yield* receipt.response.error
        },
      )

      const subscribeProject: ControlPlaneService["subscribeProject"] = (input) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const buffer = yield* makeLiveBuffer(worker.streamEvents)
            const head = yield* worker.latestSequence.pipe(
              Effect.mapError(unavailable("project-stream")),
            )
            const replayGap =
              input.afterSequence === undefined ? undefined : head - input.afterSequence
            if (
              input.afterSequence !== undefined &&
              replayGap !== undefined &&
              !requiresFreshSnapshot(replayGap)
            ) {
              yield* hooks.beforeProjectCatchUp?.(Sequence.make(head)) ?? Effect.void
              const catchUp = yield* worker
                .readEvents(input.afterSequence, Math.max(1, replayGap))
                .pipe(Effect.mapError(unavailable("project-stream")))
              const historical: Stream.Stream<ProjectStreamItem, ServiceUnavailable> =
                Stream.fromIterable(catchUp).pipe(
                  Stream.filter(
                    (event) => event.sequence <= head && event.projectId === input.projectId,
                  ),
                  Stream.filter((event) => isProjectStreamEvent(event.event)),
                  Stream.mapEffect(toEnvelope),
                  Stream.map((event): ProjectStreamItem => ({ kind: "event" as const, event })),
                )
              const tail = bufferedTail<ProjectStreamItem>(
                buffer,
                head,
                input.requestCompletionMarker,
                (event) =>
                  event.projectId === input.projectId && isProjectStreamEvent(event.event)
                    ? toEnvelope(event).pipe(
                        Effect.map((envelope) => [
                          { kind: "event" as const, event: envelope } satisfies ProjectStreamItem,
                        ]),
                      )
                    : Effect.succeed([]),
                { kind: "synchronized" },
              )
              return Stream.concat(historical, tail)
            }
            const snapshot = yield* readBoardSnapshot(input.projectId).pipe(
              Effect.mapError(unavailable("project-snapshot")),
            )
            if (Option.isNone(snapshot)) {
              return yield* new ServiceUnavailable({ service: "project-snapshot" })
            }
            yield* hooks.afterProjectSnapshot?.(snapshot.value.snapshotSequence) ?? Effect.void
            return Stream.concat(
              Stream.make({
                kind: "snapshot" as const,
                snapshot: snapshot.value,
              } satisfies ProjectStreamItem),
              bufferedTail<ProjectStreamItem>(
                buffer,
                snapshot.value.snapshotSequence,
                input.requestCompletionMarker,
                (event) =>
                  event.projectId === input.projectId && isProjectStreamEvent(event.event)
                    ? toEnvelope(event).pipe(
                        Effect.map((envelope) => [
                          { kind: "event" as const, event: envelope } satisfies ProjectStreamItem,
                        ]),
                      )
                    : Effect.succeed([]),
                { kind: "synchronized" },
              ),
            )
          }),
        ).pipe(Stream.provideService(SqlClient, sql))

      const subscribeThread: ControlPlaneService["subscribeThread"] = (input) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const buffer = yield* makeLiveBuffer(worker.streamEvents)
            const head = yield* worker.latestSequence.pipe(
              Effect.mapError(unavailable("thread-stream")),
            )
            const replayGap =
              input.afterSequence === undefined ? undefined : head - input.afterSequence
            const matches = (event: PersistedEvent<DomainEventType>) =>
              isThreadEvent(event.event) && threadIdOf(event.event) === input.threadId
            if (
              input.afterSequence !== undefined &&
              replayGap !== undefined &&
              !requiresFreshSnapshot(replayGap)
            ) {
              const catchUp = yield* worker
                .readEvents(input.afterSequence, Math.max(1, replayGap))
                .pipe(Effect.mapError(unavailable("thread-stream")))
              const historical: Stream.Stream<ThreadStreamItem, ServiceUnavailable> =
                Stream.fromIterable(catchUp).pipe(
                  Stream.filter((event) => event.sequence <= head && matches(event)),
                  Stream.mapEffect(toEnvelope),
                  Stream.map((event): ThreadStreamItem => ({ kind: "event" as const, event })),
                )
              const tail = bufferedTail<ThreadStreamItem>(
                buffer,
                head,
                input.requestCompletionMarker,
                (event) =>
                  matches(event)
                    ? toEnvelope(event).pipe(
                        Effect.map((envelope) => [
                          { kind: "event" as const, event: envelope } satisfies ThreadStreamItem,
                        ]),
                      )
                    : Effect.succeed([]),
                { kind: "synchronized" },
              )
              return Stream.concat(historical, tail)
            }
            const snapshot = yield* readThreadSnapshot(input.threadId).pipe(
              Effect.mapError(unavailable("thread-snapshot")),
            )
            if (Option.isNone(snapshot)) {
              return yield* new ServiceUnavailable({ service: "thread-snapshot" })
            }
            yield* hooks.afterThreadSnapshot?.(snapshot.value.snapshotSequence) ?? Effect.void
            return Stream.concat(
              Stream.make({
                kind: "snapshot" as const,
                snapshot: snapshot.value,
              } satisfies ThreadStreamItem),
              bufferedTail<ThreadStreamItem>(
                buffer,
                snapshot.value.snapshotSequence,
                input.requestCompletionMarker,
                (event) =>
                  matches(event)
                    ? toEnvelope(event).pipe(
                        Effect.map((envelope) => [
                          { kind: "event" as const, event: envelope } satisfies ThreadStreamItem,
                        ]),
                      )
                    : Effect.succeed([]),
                { kind: "synchronized" },
              ),
            )
          }),
        ).pipe(Stream.provideService(SqlClient, sql))

      const subscribeShell: ControlPlaneService["subscribeShell"] = (input) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const buffer = yield* makeLiveBuffer(worker.streamEvents)
            const head = yield* worker.latestSequence.pipe(
              Effect.mapError(unavailable("shell-stream")),
            )
            const mapEvent = (event: PersistedEvent<DomainEventType>) =>
              shellLiveEvent(environment, event).pipe(
                Effect.mapError(unavailable("shell-stream")),
                Effect.map((events) =>
                  events.map(
                    (shellEvent) =>
                      ({ kind: "event" as const, event: shellEvent }) satisfies ShellStreamItem,
                  ),
                ),
              )
            const replayGap =
              input.afterSequence === undefined ? undefined : head - input.afterSequence
            if (
              input.afterSequence !== undefined &&
              replayGap !== undefined &&
              !requiresFreshSnapshot(replayGap)
            ) {
              const catchUp = yield* worker
                .readEvents(input.afterSequence, Math.max(1, replayGap))
                .pipe(Effect.mapError(unavailable("shell-stream")))
              const historical = Stream.fromIterable(catchUp).pipe(
                Stream.filter((event) => event.sequence <= head),
                Stream.mapEffect(mapEvent),
                Stream.flatMap((items) => Stream.fromIterable(items)),
              )
              return coalesceShell(
                Stream.concat(
                  historical,
                  bufferedTail<ShellStreamItem, ServiceUnavailable, SqlClient>(
                    buffer,
                    head,
                    input.requestCompletionMarker,
                    mapEvent,
                    { kind: "synchronized" },
                  ),
                ),
              )
            }
            const snapshot: ShellSnapshot = yield* readShellSnapshot(environment).pipe(
              Effect.mapError(unavailable("shell-snapshot")),
            )
            yield* hooks.afterShellSnapshot?.(snapshot.snapshotSequence) ?? Effect.void
            return Stream.concat(
              Stream.make({ kind: "snapshot" as const, snapshot } satisfies ShellStreamItem),
              coalesceShell(
                bufferedTail<ShellStreamItem, ServiceUnavailable, SqlClient>(
                  buffer,
                  snapshot.snapshotSequence,
                  input.requestCompletionMarker,
                  mapEvent,
                  { kind: "synchronized" },
                ),
              ),
            )
          }),
        ).pipe(Stream.provideService(SqlClient, sql))

      const getConfig = readSchemaVersion().pipe(
        Effect.provideService(SqlClient, sql),
        Effect.map((databaseSchemaVersion) => ({
          environmentId: config.environmentId,
          bundleVersion: config.bundleVersion,
          serverVersion: config.serverVersion,
          databaseSchemaVersion,
        })),
        Effect.mapError(unavailable("sqlite")),
      )

      yield* Effect.logInfo("Control plane reactors started")
      return ControlPlane.of({
        dispatch,
        subscribeShell,
        subscribeProject,
        subscribeThread,
        getConfig,
        probe: Effect.succeed({}),
        drainReactors: Effect.gen(function* () {
          yield* worker.drainReactors
          yield* provider.drain
          yield* worker.drainReactors
        }),
      })
    }),
  )

export const controlPlaneLayer = makeControlPlaneLayer()
