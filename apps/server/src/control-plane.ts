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
import { recoverAfterBoot } from "@noyau/domain/thread/recovery"
import type {
  AgentIntegrationFailed,
  ProjectAgentIntegration,
  ProjectAgentIntegrationInput,
} from "@noyau/protocol/agent-integration"
import type { AttachmentPreview, PreviewAttachmentInput } from "@noyau/protocol/attachment-preview"
import type { AttachmentPreviewFailed } from "@noyau/protocol/attachment-preview"
import type { ClientCommandRequest, Command as CommandType } from "@noyau/protocol/commands"
import { Command } from "@noyau/protocol/commands"
import { Environment, WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { Project } from "@noyau/protocol/entities/project"
import type { WorkspacePathSearchResult } from "@noyau/protocol/entities/workspace-path"
import type { CommandIdConflict } from "@noyau/protocol/errors"
import { ServiceUnavailable } from "@noyau/protocol/errors"
import {
  decodeEventEnvelope,
  DomainEvent,
  type DomainEvent as DomainEventType,
} from "@noyau/protocol/events"
import type { FilePreview, PreviewFileInput } from "@noyau/protocol/file-preview"
import type { FilePreviewFailed } from "@noyau/protocol/file-preview"
import type { GitCommandError } from "@noyau/protocol/git"
import {
  type ActorId,
  CorrelationId,
  KanbanColumnId,
  ProjectId,
  type ProjectId as ProjectIdType,
  Sequence,
  type Sequence as SequenceType,
  type ThreadId,
} from "@noyau/protocol/ids"
import { ProjectCommand } from "@noyau/protocol/project/commands"
import {
  ProjectNotFound,
  ProjectUnavailable,
  WorkspaceRootConflict,
  WorkspaceRootNotDirectory,
  WorkspaceRootNotFound,
} from "@noyau/protocol/project/errors"
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
import type { SetShellFocusInput, ShellLiveEvent, ShellSnapshot } from "@noyau/protocol/shell"
import { ThreadCommand } from "@noyau/protocol/thread/commands"
import { ThreadEvent } from "@noyau/protocol/thread/events"
import { BoardInitialize, TicketCommand } from "@noyau/protocol/ticket/commands"
import { TicketEvent } from "@noyau/protocol/ticket/events"
import type { GetTurnDiffInput, TurnDiffPatch } from "@noyau/protocol/turn-diff"
import { TurnDiffUnavailable } from "@noyau/protocol/turn-diff"
import { ThreadLive } from "@noyau/server/thread-live"
import {
  Context,
  Crypto,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  PubSub,
  Queue,
  Result,
  Schema,
  type Scope,
  Stream,
} from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { AgentSkillInstaller } from "./agent-skill/installer.ts"
import { loadTurnAttachments, persistTurnUploads, readAttachmentPreview } from "./attachments.ts"
import { ServerConfig } from "./config.ts"
import { journalEventTouchesPresence } from "./discord/activity.ts"
import { makePresenceController } from "./discord/presence.ts"
import { readFilePreview } from "./file-preview.ts"
import { GitRuntime } from "./git/git-runtime.ts"
import { makeTurnDiffReactor } from "./git/turn-diff-reactor.ts"
import { resolveTurnDiffCheckpoints } from "./git/turn-diff.ts"
import { makeCommandWorker, type PersistedEvent } from "./persistence/command-worker.ts"
import { makeDrainableWorker } from "./persistence/drainable-worker.ts"
import { findWorkspaceRootOwner, projectDomainEvent } from "./persistence/projections.ts"
import {
  readBoardSnapshot,
  readProjectShellById,
  readShellSnapshot,
  readThreadShellById,
  readThreadSnapshot,
} from "./persistence/snapshots.ts"
import { ProviderPort } from "./provider/provider-port.ts"
import { makeProviderReactor, type DispatchInternal } from "./provider/provider-reactor.ts"
import { makeProviderSessionReaper } from "./provider/provider-session-reaper.ts"
import { coalescePersistedForShell, threadEventTouchesShell, threadIdOf } from "./shell-live.ts"
import { TextGeneration } from "./text-generation/text-generation.ts"
import { makeThreadTitleReactor } from "./text-generation/thread-title-reactor.ts"
import { makeWorktreeBranchReactor } from "./text-generation/worktree-branch-reactor.ts"
import { searchWorkspacePathsInRoot } from "./workspace-path-search.ts"
import { WorkspaceRootAccess, type WorkspaceRootAccessService } from "./workspace-root.ts"

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
    const projectDecision = decideProject(state.projects, command)
    if (command._tag !== "project.create") {
      return projectDecision
    }
    const initializationFields = {
      commandId: command.commandId,
      projectId: command.projectId,
      actorId: command.actorId,
      correlationId: command.correlationId,
      issuedAt: command.issuedAt,
      schemaVersion: command.schemaVersion,
      payload: command.initialBoard,
    }
    const initialization =
      command.causationId === undefined
        ? BoardInitialize.make(initializationFields)
        : BoardInitialize.make({ ...initializationFields, causationId: command.causationId })
    return projectDecision.pipe(
      Result.flatMap((projectEvents) =>
        decideBoard(state.board, initialization).pipe(
          Result.map((boardEvents) =>
            Array.from<DomainEventType>(projectEvents).concat(boardEvents),
          ),
        ),
      ),
    )
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

const recoverControlStateAfterBoot = (
  state: ControlState,
  recoveredAt: DateTime.Utc,
): ControlState => ({
  ...state,
  threads: recoverAfterBoot(state.threads, recoveredAt).reduce(evolveThread, state.threads),
})

const ScopeRow = Schema.Struct({ project_id: Schema.String })
const WorkspaceRootRow = Schema.Struct({ workspace_root: Schema.String })
const MigrationRow = Schema.Struct({ migration_id: Schema.Int })
const decodeScopeRow = Schema.decodeEffect(ScopeRow)
const decodeWorkspaceRootRow = Schema.decodeEffect(WorkspaceRootRow)
const decodeMigrationRow = Schema.decodeEffect(MigrationRow)
const decodeCommand = Schema.decodeUnknownEffect(Command)
const encodeDomainEvent = Schema.encodeUnknownEffect(DomainEvent)

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

const workspaceRootForProject = Effect.fn("ControlPlane.workspaceRootForProject")(function* (
  projectId: ProjectIdType,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof WorkspaceRootRow)["Encoded"]
  >`SELECT workspace_root FROM projection_projects WHERE project_id = ${projectId}`
  const row = rows[0]
  if (row === undefined) {
    return Option.none<WorkspaceRoot>()
  }
  const workspaceRoot = (yield* decodeWorkspaceRootRow(row).pipe(Effect.orDie)).workspace_root
  return Option.some(yield* Schema.decodeEffect(WorkspaceRoot)(workspaceRoot).pipe(Effect.orDie))
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
    case "thread.delete":
    case "thread.settle":
    case "thread.unsettle":
    case "thread.meta.update":
    case "thread.runtime-mode.set":
    case "thread.model-selection.set":
    case "thread.turn.start":
    case "thread.turn.interrupt":
    case "approval.respond":
    case "user-input.respond":
    case "session.stop":
      return yield* projectForThread(request.payload.threadId)
  }
})

const columnIdFromDigest = (digest: Uint8Array) => {
  const bytes = digest.slice(0, 16)
  const versionByte = bytes[6]
  const variantByte = bytes[8]
  if (versionByte === undefined || variantByte === undefined) {
    throw new Error("SHA-256 digest is shorter than 16 bytes")
  }
  bytes[6] = (versionByte & 0x0f) | 0x50
  bytes[8] = (variantByte & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return KanbanColumnId.make(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  )
}

const initialBoardFor = Effect.fn("ControlPlane.initialBoardFor")(function* (commandId: string) {
  const crypto = yield* Crypto.Crypto
  const encoder = new TextEncoder()
  const derive = (role: "active" | "backlog" | "done") =>
    crypto
      .digest("SHA-256", encoder.encode(`board:${role}:${commandId}`))
      .pipe(Effect.map(columnIdFromDigest))
  const [backlogColumnId, activeColumnId, doneColumnId] = yield* Effect.all([
    derive("backlog"),
    derive("active"),
    derive("done"),
  ])
  return { backlogColumnId, activeColumnId, doneColumnId }
})

const validateWorkspaceRoot = Effect.fn("ControlPlane.validateWorkspaceRoot")(function* (
  command: CommandType,
) {
  if (command._tag !== "project.create" && command._tag !== "project.rebind") {
    return null
  }
  const workspaceRoot = command.payload.workspaceRoot
  const fileSystem = yield* FileSystem.FileSystem
  const result = yield* fileSystem.stat(workspaceRoot).pipe(
    Effect.map((info) => ({ _tag: "Found" as const, info })),
    Effect.catchTag("PlatformError", (error) =>
      error.reason._tag === "NotFound"
        ? Effect.succeed({ _tag: "Missing" as const })
        : Effect.fail(new ServiceUnavailable({ service: "filesystem" })),
    ),
  )
  if (result._tag === "Missing") {
    return new WorkspaceRootNotFound({ workspaceRoot })
  }
  return result.info.type === "Directory" ? null : new WorkspaceRootNotDirectory({ workspaceRoot })
})

const enrichCommand = Effect.fn("ControlPlane.enrichCommand")(function* (
  request: ClientCommandRequest,
  actorId: ActorId,
) {
  const projectId = yield* requestProjectId(request)
  const issuedAt = yield* DateTime.now
  const attachments =
    request._tag === "thread.turn.start" ? yield* persistTurnUploads(request) : undefined
  const enrichedRequest =
    request._tag === "project.create"
      ? {
          ...request,
          initialBoard: yield* initialBoardFor(request.commandId).pipe(
            Effect.mapError(() => new ServiceUnavailable({ service: "crypto" })),
          ),
        }
      : request._tag === "thread.turn.start" && attachments !== undefined
        ? { ...request, payload: { ...request.payload, attachments } }
        : request
  return yield* decodeCommand({
    ...enrichedRequest,
    projectId,
    actorId,
    correlationId: CorrelationId.make(request.commandId),
    issuedAt: DateTime.formatIso(issuedAt),
    schemaVersion: 1,
  }).pipe(Effect.orDie)
})

const toEnvelope = (event: PersistedEvent<DomainEventType>) =>
  encodeDomainEvent(event.event).pipe(
    Effect.flatMap((encodedEvent) =>
      decodeEventEnvelope({
        eventId: event.eventId,
        sequence: event.sequence,
        projectId: event.projectId,
        actorId: event.actorId,
        correlationId: event.correlationId,
        causationId: event.causationId,
        occurredAt: DateTime.formatIso(event.occurredAt),
        schemaVersion: event.schemaVersion,
        event: encodedEvent,
      }),
    ),
    Effect.orDie,
  )

const unavailable = (service: string) => () => new ServiceUnavailable({ service })

type LiveInput =
  | { readonly kind: "event"; readonly event: PersistedEvent<DomainEventType> }
  | { readonly kind: "synchronized" }

const makeLiveBuffer = Effect.fn("ControlPlane.makeLiveBuffer")(function* (
  subscribeEvents: Effect.Effect<
    PubSub.Subscription<PersistedEvent<DomainEventType>>,
    never,
    Scope.Scope
  >,
) {
  // Register synchronously before reading the boundary/snapshot. Starting a
  // Stream.fromPubSub fiber leaves a gap where a committed event can be missed.
  const events = yield* subscribeEvents
  const buffer = yield* Queue.unbounded<LiveInput>()
  yield* Effect.forkScoped(
    PubSub.take(events).pipe(
      Effect.flatMap((event) => Queue.offer(buffer, { kind: "event", event })),
      Effect.forever,
    ),
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

const assistantLiveFrames = (threadLive: ThreadLive["Service"], threadId: ThreadId) =>
  threadLive
    .subscribe(threadId)
    .pipe(Stream.map((live): ThreadStreamItem => ({ kind: "live" as const, live })))

const withAssistantLive = (
  threadLive: ThreadLive["Service"],
  threadId: ThreadId,
  prefix: Stream.Stream<ThreadStreamItem, ServiceUnavailable>,
  tail: Stream.Stream<ThreadStreamItem, ServiceUnavailable>,
) =>
  Stream.concat(
    prefix,
    Stream.merge(tail, assistantLiveFrames(threadLive, threadId), { haltStrategy: "left" }),
  )

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
  persisted: PersistedEvent<DomainEventType>,
  workspaceRoots: WorkspaceRootAccessService,
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
    const project = yield* readProjectShellById(event.projectId)
    if (Option.isNone(project)) {
      return []
    }
    const available = yield* workspaceRoots.isAvailable(project.value.workspaceRoot)
    return [
      {
        _tag: "project-upserted",
        sequence: Sequence.make(persisted.sequence),
        project: { ...project.value, available },
      } satisfies ShellLiveEvent,
    ]
  }
  if (isThreadEvent(event)) {
    if (!threadEventTouchesShell(event)) {
      return []
    }
    const threadId = threadIdOf(event)
    const thread = yield* readThreadShellById(threadId)
    return Option.match(thread, {
      onNone: () => [
        {
          _tag: "thread-removed",
          sequence: Sequence.make(persisted.sequence),
          threadId,
        } satisfies ShellLiveEvent,
      ],
      onSome: (next) => [
        {
          _tag: "thread-upserted",
          sequence: Sequence.make(persisted.sequence),
          thread: next,
        } satisfies ShellLiveEvent,
      ],
    })
  }
  return []
})

const SHELL_REFETCH_CONCURRENCY = 8
const SHELL_COALESCE_WINDOW = Duration.millis(25)
const SHELL_COALESCE_MAX_CHUNK = 256

const fetchShellLiveItems = (
  events: ReadonlyArray<PersistedEvent<DomainEventType>>,
  workspaceRoots: WorkspaceRootAccessService,
) =>
  Effect.forEach(
    coalescePersistedForShell(events),
    (event) => shellLiveEvent(event, workspaceRoots),
    { concurrency: SHELL_REFETCH_CONCURRENCY },
  ).pipe(
    Effect.map((batches) =>
      batches.flatMap((shellEvents) =>
        shellEvents.map(
          (shellEvent) => ({ kind: "event" as const, event: shellEvent }) satisfies ShellStreamItem,
        ),
      ),
    ),
  )

const flushShellLiveInputs = (
  inputs: ReadonlyArray<LiveInput>,
  boundary: number,
  workspaceRoots: WorkspaceRootAccessService,
) =>
  Effect.gen(function* () {
    const output: Array<ShellStreamItem> = []
    let pending: Array<PersistedEvent<DomainEventType>> = []
    const flushPending = Effect.gen(function* () {
      if (pending.length === 0) {
        return
      }
      const items = yield* fetchShellLiveItems(pending, workspaceRoots)
      pending = []
      output.push(...items)
    })
    for (const item of inputs) {
      if (item.kind === "synchronized") {
        yield* flushPending
        output.push({ kind: "synchronized" })
        continue
      }
      if (eventSequence(item) <= boundary) {
        continue
      }
      pending.push(item.event)
    }
    yield* flushPending
    return output
  })

const shellLiveTail = (
  buffer: Queue.Dequeue<LiveInput> & Queue.Enqueue<LiveInput>,
  boundary: number,
  requestCompletionMarker: boolean | undefined,
  workspaceRoots: WorkspaceRootAccessService,
) => {
  const stream = Stream.fromQueue(buffer).pipe(
    Stream.groupedWithin(SHELL_COALESCE_MAX_CHUNK, SHELL_COALESCE_WINDOW),
    Stream.mapEffect((items) => flushShellLiveInputs(items, boundary, workspaceRoots)),
    Stream.flatMap((items) => Stream.fromIterable(items)),
  )
  return requestCompletionMarker === true
    ? Stream.concat(
        Stream.fromEffect(Queue.offer(buffer, { kind: "synchronized" })).pipe(Stream.drain),
        stream,
      )
    : stream
}

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
  readonly hasRunningTurn: Effect.Effect<boolean, ServiceUnavailable>
  readonly setShellFocus: (
    input: SetShellFocusInput,
  ) => Effect.Effect<Record<never, never>, ServiceUnavailable>
  readonly previewFile: (
    input: PreviewFileInput,
  ) => Effect.Effect<FilePreview, ProjectNotFound | FilePreviewFailed | ServiceUnavailable>
  readonly searchWorkspacePaths: (
    projectId: ProjectIdType,
    query: string,
  ) => Effect.Effect<
    WorkspacePathSearchResult,
    ServiceUnavailable | ProjectNotFound | ProjectUnavailable
  >
  readonly inspectProjectAgentIntegration: (
    input: ProjectAgentIntegrationInput,
  ) => Effect.Effect<ProjectAgentIntegration, ProjectNotFound | ServiceUnavailable>
  readonly installProjectAgentIntegration: (
    input: ProjectAgentIntegrationInput,
  ) => Effect.Effect<
    ProjectAgentIntegration,
    ProjectNotFound | AgentIntegrationFailed | ServiceUnavailable
  >
  readonly removeProjectAgentIntegration: (
    input: ProjectAgentIntegrationInput,
  ) => Effect.Effect<
    ProjectAgentIntegration,
    ProjectNotFound | AgentIntegrationFailed | ServiceUnavailable
  >
  readonly previewAttachment: (
    input: PreviewAttachmentInput,
  ) => Effect.Effect<AttachmentPreview, AttachmentPreviewFailed | ServiceUnavailable>
  readonly getTurnDiff: (
    input: GetTurnDiffInput,
  ) => Effect.Effect<TurnDiffPatch, TurnDiffUnavailable | GitCommandError | ServiceUnavailable>
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

const workerNotReady: DispatchInternal = (_command) =>
  Effect.die("Provider reactor dispatched before the command worker was ready")

const validateProjectLifecycle = Effect.fn("ControlPlane.validateProjectLifecycle")(function* (
  command: CommandType,
) {
  const workspaceRootRejection = yield* validateWorkspaceRoot(command)
  if (workspaceRootRejection !== null) {
    return workspaceRootRejection
  }
  if (command._tag !== "project.create" && command._tag !== "project.rebind") {
    return null
  }
  const owner = yield* findWorkspaceRootOwner(
    command.payload.workspaceRoot,
    command._tag === "project.rebind" ? command.payload.projectId : undefined,
  )
  return Option.match(owner, {
    onNone: () => null,
    onSome: (projectId) =>
      command._tag === "project.create" && projectId === command.payload.projectId
        ? null
        : new WorkspaceRootConflict({
            workspaceRoot: command.payload.workspaceRoot,
            projectId,
          }),
  })
})

export const makeControlPlaneLayer = (hooks: ControlPlaneHooks = {}) =>
  Layer.effect(
    ControlPlane,
    Effect.gen(function* () {
      const config = yield* ServerConfig
      const sql = yield* SqlClient
      const provider = yield* ProviderPort
      const workspaceRoots = yield* WorkspaceRootAccess
      const agentSkills = yield* AgentSkillInstaller
      const recoveredAt = yield* DateTime.now
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const crypto = yield* Crypto.Crypto
      let dispatchInternal = workerNotReady
      const providerSessionReaper = yield* makeProviderSessionReaper()
      const threadLive = yield* ThreadLive
      const textGeneration = yield* TextGeneration
      const git = yield* GitRuntime
      const presence = yield* makePresenceController()
      const providerStatuses = yield* provider.status
      const environment = new Environment({
        id: config.environmentId,
        cursor: providerStatuses.cursor,
        claude: providerStatuses.claude,
        codex: providerStatuses.codex,
        createdAt: config.environmentCreatedAt,
      })
      const processProviderEvent = yield* makeProviderReactor(
        (command) => dispatchInternal(command),
        (attachments) =>
          loadTurnAttachments(attachments).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
            Effect.provideService(ServerConfig, config),
          ),
      ).pipe(Effect.provideService(ProviderPort, provider), Effect.provideService(SqlClient, sql))
      const processTitleEvent = yield* makeThreadTitleReactor((command) =>
        dispatchInternal(command),
      ).pipe(
        Effect.provideService(TextGeneration, textGeneration),
        Effect.provideService(SqlClient, sql),
      )
      const processWorktreeBranchEvent = yield* makeWorktreeBranchReactor((command) =>
        dispatchInternal(command),
      ).pipe(
        Effect.provideService(TextGeneration, textGeneration),
        Effect.provideService(SqlClient, sql),
      )
      const processTurnDiffEvent = yield* makeTurnDiffReactor((command) =>
        dispatchInternal(command),
      ).pipe(Effect.provideService(SqlClient, sql))
      const processPresenceEvent = (event: PersistedEvent<DomainEventType>) =>
        journalEventTouchesPresence(event.event)
          ? readShellSnapshot(environment).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.flatMap(presence.sync),
              Effect.catchCause((cause) =>
                Effect.logWarning("Discord presence sync failed", { cause }),
              ),
            )
          : Effect.void
      const providerReactor = yield* makeDrainableWorker(processProviderEvent)
      const titleReactor = yield* makeDrainableWorker(processTitleEvent)
      const worktreeBranchReactor = yield* makeDrainableWorker(processWorktreeBranchEvent)
      const turnDiffReactor = yield* makeDrainableWorker(processTurnDiffEvent)
      const presenceReactor = yield* makeDrainableWorker(processPresenceEvent)
      const reactor = {
        enqueue: (event: PersistedEvent<DomainEventType>) =>
          Effect.andThen(
            providerReactor.enqueue(event),
            Effect.andThen(
              titleReactor.enqueue(event),
              Effect.andThen(
                worktreeBranchReactor.enqueue(event),
                Effect.andThen(turnDiffReactor.enqueue(event), presenceReactor.enqueue(event)),
              ),
            ),
          ),
        drain: Effect.andThen(
          providerReactor.drain,
          Effect.andThen(
            titleReactor.drain,
            Effect.andThen(
              worktreeBranchReactor.drain,
              Effect.andThen(turnDiffReactor.drain, presenceReactor.drain),
            ),
          ),
        ),
      }
      const worker = yield* makeCommandWorker({
        commandSchema: Command,
        eventSchema: DomainEvent,
        rejectionSchema: Rejection,
        metadata: (command) => command,
        aggregate: (command) => ({ kind: "project", id: command.projectId }),
        initialState: () => emptyControlState,
        recoverStateAfterReplay: (state) => recoverControlStateAfterBoot(state, recoveredAt),
        decide,
        evolve,
        validate: (command) =>
          validateProjectLifecycle(command).pipe(
            Effect.provideService(FileSystem.FileSystem, fileSystem),
          ),
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
          Effect.orDie,
        )
      yield* providerSessionReaper.start

      const ensureWorkspaceAvailable = Effect.fn("ControlPlane.ensureWorkspaceAvailable")(
        function* (request: ClientCommandRequest) {
          if (request._tag === "project.create" || request._tag === "project.rebind") {
            return
          }
          if (request._tag === "project.meta.update" || request._tag === "project.delete") {
            return
          }
          const projectId = yield* requestProjectId(request).pipe(
            Effect.provideService(SqlClient, sql),
          )
          const workspaceRoot = yield* workspaceRootForProject(projectId).pipe(
            Effect.provideService(SqlClient, sql),
          )
          if (
            Option.isSome(workspaceRoot) &&
            !(yield* workspaceRoots.isAvailable(workspaceRoot.value))
          ) {
            return yield* new ProjectUnavailable({ projectId })
          }
        },
      )

      const readAvailableBoardSnapshot = Effect.fn("ControlPlane.readAvailableBoardSnapshot")(
        function* (projectId: ProjectIdType) {
          const snapshot = yield* readBoardSnapshot(projectId)
          if (Option.isNone(snapshot)) {
            return snapshot
          }
          const available = yield* workspaceRoots.isAvailable(snapshot.value.project.workspaceRoot)
          return Option.some({
            ...snapshot.value,
            project: new Project({
              id: snapshot.value.project.id,
              name: snapshot.value.project.name,
              workspaceRoot: snapshot.value.project.workspaceRoot,
              available,
              createdAt: snapshot.value.project.createdAt,
              updatedAt: snapshot.value.project.updatedAt,
            }),
          })
        },
      )

      const readAvailableShellSnapshot = Effect.fn("ControlPlane.readAvailableShellSnapshot")(
        function* () {
          const snapshot = yield* readShellSnapshot(environment)
          const projects = yield* Effect.forEach(snapshot.projects, (project) =>
            workspaceRoots
              .isAvailable(project.workspaceRoot)
              .pipe(Effect.map((available) => ({ ...project, available }))),
          )
          return { ...snapshot, projects }
        },
      )

      const dispatch: ControlPlaneService["dispatch"] = Effect.fn("ControlPlane.dispatch")(
        function* (request, actorId) {
          yield* ensureWorkspaceAvailable(request).pipe(
            Effect.mapError((error) =>
              error._tag === "SqlError" ? new ServiceUnavailable({ service: "sqlite" }) : error,
            ),
          )
          const command = yield* enrichCommand(request, actorId).pipe(
            Effect.provideService(SqlClient, sql),
            Effect.provideService(Crypto.Crypto, crypto),
            Effect.provideService(FileSystem.FileSystem, fileSystem),
            Effect.provideService(Path.Path, path),
            Effect.provideService(ServerConfig, config),
            Effect.catchTag("SqlError", unavailable("sqlite")),
          )
          const receipt = yield* worker
            .dispatch(command)
            .pipe(
              Effect.mapError((error) =>
                error._tag === "CommandIdConflict" || error._tag === "ServiceUnavailable"
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
            const buffer = yield* makeLiveBuffer(worker.subscribeEvents)
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
            const snapshot = yield* readAvailableBoardSnapshot(input.projectId).pipe(
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
            const buffer = yield* makeLiveBuffer(worker.subscribeEvents)
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
              return withAssistantLive(threadLive, input.threadId, historical, tail)
            }
            const snapshot = yield* readThreadSnapshot(input.threadId).pipe(
              Effect.mapError(unavailable("thread-snapshot")),
            )
            if (Option.isNone(snapshot)) {
              return yield* new ServiceUnavailable({ service: "thread-snapshot" })
            }
            yield* hooks.afterThreadSnapshot?.(snapshot.value.snapshotSequence) ?? Effect.void
            return withAssistantLive(
              threadLive,
              input.threadId,
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
            const buffer = yield* makeLiveBuffer(worker.subscribeEvents)
            const head = yield* worker.latestSequence.pipe(
              Effect.mapError(unavailable("shell-stream")),
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
              const historical = yield* fetchShellLiveItems(
                catchUp.filter((event) => event.sequence <= head),
                workspaceRoots,
              ).pipe(Effect.mapError(unavailable("shell-stream")))
              return Stream.concat(
                Stream.fromIterable(historical),
                shellLiveTail(buffer, head, input.requestCompletionMarker, workspaceRoots).pipe(
                  Stream.mapError(unavailable("shell-stream")),
                ),
              )
            }
            const snapshot: ShellSnapshot = yield* readAvailableShellSnapshot().pipe(
              Effect.mapError(unavailable("shell-snapshot")),
            )
            yield* hooks.afterShellSnapshot?.(snapshot.snapshotSequence) ?? Effect.void
            return Stream.concat(
              Stream.make({ kind: "snapshot" as const, snapshot } satisfies ShellStreamItem),
              shellLiveTail(
                buffer,
                snapshot.snapshotSequence,
                input.requestCompletionMarker,
                workspaceRoots,
              ).pipe(Stream.mapError(unavailable("shell-stream"))),
            )
          }),
        ).pipe(Stream.provideService(SqlClient, sql))

      const setShellFocus = Effect.fn("ControlPlane.setShellFocus")(function* (
        input: SetShellFocusInput,
      ): Effect.fn.Return<Record<never, never>, ServiceUnavailable> {
        yield* presence.setIntent(input)
        const snapshot = yield* readAvailableShellSnapshot().pipe(
          Effect.provideService(SqlClient, sql),
          Effect.mapError(unavailable("shell-snapshot")),
        )
        yield* presence.sync(snapshot)
        return {}
      })

      const previewFile = Effect.fn("ControlPlane.previewFile")(function* (
        input: PreviewFileInput,
      ): Effect.fn.Return<FilePreview, ProjectNotFound | FilePreviewFailed | ServiceUnavailable> {
        const workspaceRoot = yield* workspaceRootForProject(input.projectId).pipe(
          Effect.provideService(SqlClient, sql),
          Effect.mapError(unavailable("sqlite")),
        )
        if (Option.isNone(workspaceRoot)) {
          return yield* new ProjectNotFound({ projectId: input.projectId })
        }
        return yield* readFilePreview({
          requestedPath: input.path,
          workspaceRoot: workspaceRoot.value,
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
        )
      })

      const projectWorkspaceRoot = Effect.fn("ControlPlane.projectWorkspaceRoot")(function* (
        projectId: ProjectIdType,
      ) {
        const workspaceRoot = yield* workspaceRootForProject(projectId).pipe(
          Effect.provideService(SqlClient, sql),
          Effect.mapError(unavailable("sqlite")),
        )
        if (Option.isNone(workspaceRoot)) {
          return yield* new ProjectNotFound({ projectId })
        }
        return workspaceRoot.value
      })

      const searchWorkspacePaths: ControlPlaneService["searchWorkspacePaths"] = Effect.fn(
        "ControlPlane.searchWorkspacePaths",
      )(function* (projectId, query) {
        const workspaceRoot = yield* projectWorkspaceRoot(projectId)
        if (!(yield* workspaceRoots.isAvailable(workspaceRoot))) {
          return yield* new ProjectUnavailable({ projectId })
        }
        return yield* searchWorkspacePathsInRoot(workspaceRoot, query).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.mapError(unavailable("workspace-search")),
        )
      })

      const inspectProjectAgentIntegration: ControlPlaneService["inspectProjectAgentIntegration"] =
        Effect.fn("ControlPlane.inspectProjectAgentIntegration")(function* (input) {
          const workspaceRoot = yield* projectWorkspaceRoot(input.projectId)
          return yield* agentSkills.inspect(input.projectId, workspaceRoot)
        })

      const installProjectAgentIntegration: ControlPlaneService["installProjectAgentIntegration"] =
        Effect.fn("ControlPlane.installProjectAgentIntegration")(function* (input) {
          const workspaceRoot = yield* projectWorkspaceRoot(input.projectId)
          return yield* agentSkills.install(input.projectId, workspaceRoot)
        })

      const removeProjectAgentIntegration: ControlPlaneService["removeProjectAgentIntegration"] =
        Effect.fn("ControlPlane.removeProjectAgentIntegration")(function* (input) {
          const workspaceRoot = yield* projectWorkspaceRoot(input.projectId)
          return yield* agentSkills.remove(input.projectId, workspaceRoot)
        })

      const previewAttachment = Effect.fn("ControlPlane.previewAttachment")(function* (
        input: PreviewAttachmentInput,
      ): Effect.fn.Return<AttachmentPreview, AttachmentPreviewFailed | ServiceUnavailable> {
        const preview = yield* readAttachmentPreview(input.attachmentId).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.provideService(ServerConfig, config),
        )
        return { kind: "image", mime: preview.mime, bytes: preview.bytes }
      })

      const getTurnDiff = Effect.fn("ControlPlane.getTurnDiff")(function* (
        input: GetTurnDiffInput,
      ): Effect.fn.Return<
        TurnDiffPatch,
        TurnDiffUnavailable | GitCommandError | ServiceUnavailable
      > {
        const snapshot = yield* readThreadSnapshot(input.threadId).pipe(
          Effect.provideService(SqlClient, sql),
          Effect.mapError(unavailable("sqlite")),
        )
        if (Option.isNone(snapshot)) {
          return yield* new TurnDiffUnavailable({
            threadId: input.threadId,
            turnId: input.turnId,
            reason: "turn-not-found",
          })
        }
        const resolved = resolveTurnDiffCheckpoints({
          threadId: input.threadId,
          turnId: input.turnId,
          turns: snapshot.value.turns,
        })
        if (resolved._tag === "unavailable") {
          return yield* new TurnDiffUnavailable({
            threadId: input.threadId,
            turnId: input.turnId,
            reason: resolved.reason,
          })
        }
        const workspaceRoot = yield* workspaceRootForProject(snapshot.value.thread.projectId).pipe(
          Effect.provideService(SqlClient, sql),
          Effect.mapError(unavailable("sqlite")),
        )
        if (Option.isNone(workspaceRoot)) {
          return yield* new TurnDiffUnavailable({
            threadId: input.threadId,
            turnId: input.turnId,
            reason: "not-captured",
          })
        }
        const worktreePath = snapshot.value.thread.worktreePath
        const cwd =
          worktreePath !== undefined && worktreePath !== null && worktreePath.length > 0
            ? worktreePath
            : workspaceRoot.value
        const fromExists = yield* git.hasCheckpointRef({
          cwd,
          checkpointRef: resolved.from,
        })
        const toExists = yield* git.hasCheckpointRef({ cwd, checkpointRef: resolved.to })
        if (!fromExists || !toExists) {
          return yield* new TurnDiffUnavailable({
            threadId: input.threadId,
            turnId: input.turnId,
            reason: "checkpoint-missing",
          })
        }
        const patch = yield* git.diffCheckpoints({
          cwd,
          fromCheckpointRef: resolved.from,
          toCheckpointRef: resolved.to,
          format: "patch",
          ignoreWhitespace: input.ignoreWhitespace ?? true,
        })
        return {
          threadId: input.threadId,
          turnId: input.turnId,
          checkpointRef: resolved.to,
          patch,
        }
      })

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
      const hasRunningTurn = sql`
        SELECT turn_id
        FROM projection_turns
        WHERE state = 'running'
        LIMIT 1
      `.pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.mapError(unavailable("sqlite")),
      )

      yield* Effect.logInfo("Control plane reactors started")
      return ControlPlane.of({
        dispatch,
        subscribeShell,
        subscribeProject,
        subscribeThread,
        getConfig,
        hasRunningTurn,
        setShellFocus,
        previewFile,
        searchWorkspacePaths,
        inspectProjectAgentIntegration,
        installProjectAgentIntegration,
        removeProjectAgentIntegration,
        previewAttachment,
        getTurnDiff,
        probe: Effect.succeed({}),
        drainReactors: Effect.gen(function* () {
          yield* providerSessionReaper.stop
          yield* worker.drainReactors
          yield* provider.drain
          yield* provider.stopAll
          yield* worker.drainReactors
          yield* worker.drainReactors
        }),
      })
    }),
  ).pipe(Layer.provide(Path.layer))

export const controlPlaneLayer = makeControlPlaneLayer()
