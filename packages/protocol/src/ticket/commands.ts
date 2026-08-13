import { ExecutionBudget, ToolPolicy } from "@noyau/protocol/entities/execution"
import { KanbanColumnColor } from "@noyau/protocol/entities/kanban-column"
import { TicketPriority } from "@noyau/protocol/entities/ticket"
import {
  ActorId,
  AgentProfileId,
  CommandId,
  CorrelationId,
  EventId,
  ExecutionId,
  KanbanColumnId,
  ProjectId,
  SchemaVersion,
  ThreadId,
  TicketId,
} from "@noyau/protocol/ids"
import { Schema } from "effect"

const requestMeta = {
  commandId: CommandId,
  causationId: Schema.optionalKey(EventId),
} as const

const commandMeta = {
  commandId: CommandId,
  projectId: ProjectId,
  actorId: ActorId,
  correlationId: CorrelationId,
  causationId: Schema.optionalKey(EventId),
  issuedAt: Schema.DateTimeUtcFromString,
  schemaVersion: SchemaVersion,
} as const

/** Position sémantique demandée ; le serveur calcule le rank canonique. */
export const TicketPlacement = Schema.Struct({
  columnId: KanbanColumnId,
  beforeTicketId: Schema.optionalKey(TicketId),
  afterTicketId: Schema.optionalKey(TicketId),
})
export type TicketPlacement = (typeof TicketPlacement)["Type"]

const ticketCreatePayload = Schema.Struct({
  ticketId: TicketId,
  workbenchThreadId: ThreadId,
  title: Schema.NonEmptyString,
  placement: TicketPlacement,
  sourceThreadId: Schema.optionalKey(ThreadId),
}).check(
  Schema.makeFilter(
    (value) =>
      value.sourceThreadId === undefined || value.workbenchThreadId !== value.sourceThreadId,
    {
      expected: "workbenchThreadId and sourceThreadId to be different",
    },
  ),
)

const ticketMovePayload = {
  ticketId: TicketId,
  placement: TicketPlacement,
  acknowledgeOpenDependencies: Schema.optionalKey(Schema.Boolean),
  interruptActiveExecution: Schema.optionalKey(Schema.Boolean),
} as const

const ticketIdPayload = {
  ticketId: TicketId,
} as const

const ticketClosePayload = {
  ticketId: TicketId,
  acknowledgeOpenDependencies: Schema.optionalKey(Schema.Boolean),
  interruptActiveExecution: Schema.optionalKey(Schema.Boolean),
} as const

const ticketAssignPayload = {
  ticketId: TicketId,
  assigneeId: Schema.optionalKey(ActorId),
} as const

const ticketUpdatePayload = {
  ticketId: TicketId,
  title: Schema.optionalKey(Schema.NonEmptyString),
  /** Omission = inchangé, chaîne = remplacement, null = suppression explicite. */
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  priority: Schema.optionalKey(TicketPriority),
  dueAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtcFromString)),
} as const

const ticketDependencyPayload = Schema.Struct({
  ticketId: TicketId,
  dependsOnTicketId: TicketId,
}).check(
  Schema.makeFilter((value) => value.ticketId !== value.dependsOnTicketId, {
    expected: "ticketId and dependsOnTicketId to be different",
  }),
)

const executionStartPayload = {
  executionId: ExecutionId,
  ticketId: TicketId,
  expectedOutcome: Schema.NonEmptyString,
  agentProfileId: AgentProfileId,
  budget: ExecutionBudget,
  toolPolicy: ToolPolicy,
} as const

const columnCreatePayload = {
  columnId: KanbanColumnId,
  name: Schema.NonEmptyString,
  color: KanbanColumnColor,
  beforeColumnId: Schema.optionalKey(KanbanColumnId),
  afterColumnId: Schema.optionalKey(KanbanColumnId),
} as const

const columnUpdatePayload = {
  columnId: KanbanColumnId,
  name: Schema.optionalKey(Schema.NonEmptyString),
  color: Schema.optionalKey(KanbanColumnColor),
} as const

const columnMovePayload = {
  columnId: KanbanColumnId,
  beforeColumnId: Schema.optionalKey(KanbanColumnId),
  afterColumnId: Schema.optionalKey(KanbanColumnId),
} as const

const columnDeletePayload = {
  columnId: KanbanColumnId,
  destinationColumnId: Schema.optionalKey(KanbanColumnId),
} as const

const boardInitializePayload = Schema.Struct({
  backlogColumnId: KanbanColumnId,
  activeColumnId: KanbanColumnId,
  doneColumnId: KanbanColumnId,
}).check(
  Schema.makeFilter(
    (value) =>
      value.backlogColumnId !== value.activeColumnId &&
      value.backlogColumnId !== value.doneColumnId &&
      value.activeColumnId !== value.doneColumnId,
    {
      expected: "backlogColumnId, activeColumnId, and doneColumnId to be pairwise distinct",
    },
  ),
)

const request = <Tag extends string, Payload extends Schema.Top>(tag: Tag, payload: Payload) =>
  Schema.TaggedStruct(tag, { ...requestMeta, payload })

const command = <Tag extends string, Payload extends Schema.Top>(tag: Tag, payload: Payload) =>
  Schema.TaggedStruct(tag, { ...commandMeta, payload })

export const TicketCreateRequest = request("ticket.create", ticketCreatePayload)
export const TicketMoveRequest = request("ticket.move", Schema.Struct(ticketMovePayload))
export const TicketCompleteRequest = request("ticket.complete", Schema.Struct(ticketClosePayload))
export const TicketReopenRequest = request("ticket.reopen", Schema.Struct(ticketIdPayload))
export const TicketArchiveRequest = request("ticket.archive", Schema.Struct(ticketClosePayload))
export const TicketRestoreRequest = request("ticket.restore", Schema.Struct(ticketIdPayload))
export const TicketAssignRequest = request("ticket.assign", Schema.Struct(ticketAssignPayload))
export const TicketUpdateRequest = request("ticket.update", Schema.Struct(ticketUpdatePayload))
export const TicketDependencyAddRequest = request("ticket.dependency.add", ticketDependencyPayload)
export const TicketDependencyRemoveRequest = request(
  "ticket.dependency.remove",
  ticketDependencyPayload,
)
export const ExecutionStartRequest = request(
  "execution.start",
  Schema.Struct(executionStartPayload),
)
export const KanbanColumnCreateRequest = request(
  "kanbanColumn.create",
  Schema.Struct(columnCreatePayload),
)
export const KanbanColumnUpdateRequest = request(
  "kanbanColumn.update",
  Schema.Struct(columnUpdatePayload),
)
export const KanbanColumnMoveRequest = request(
  "kanbanColumn.move",
  Schema.Struct(columnMovePayload),
)
export const KanbanColumnDeleteRequest = request(
  "kanbanColumn.delete",
  Schema.Struct(columnDeletePayload),
)

export const TicketCommandRequest = Schema.Union([
  TicketCreateRequest,
  TicketMoveRequest,
  TicketCompleteRequest,
  TicketReopenRequest,
  TicketArchiveRequest,
  TicketRestoreRequest,
  TicketAssignRequest,
  TicketUpdateRequest,
  TicketDependencyAddRequest,
  TicketDependencyRemoveRequest,
  ExecutionStartRequest,
  KanbanColumnCreateRequest,
  KanbanColumnUpdateRequest,
  KanbanColumnMoveRequest,
  KanbanColumnDeleteRequest,
])
export type TicketCommandRequest = (typeof TicketCommandRequest)["Type"]
export const decodeTicketCommandRequest = Schema.decodeUnknownEffect(TicketCommandRequest)

export const TicketCreate = command("ticket.create", ticketCreatePayload)
export const TicketMove = command("ticket.move", Schema.Struct(ticketMovePayload))
export const TicketComplete = command("ticket.complete", Schema.Struct(ticketClosePayload))
export const TicketReopen = command("ticket.reopen", Schema.Struct(ticketIdPayload))
export const TicketArchive = command("ticket.archive", Schema.Struct(ticketClosePayload))
export const TicketRestore = command("ticket.restore", Schema.Struct(ticketIdPayload))
export const TicketAssign = command("ticket.assign", Schema.Struct(ticketAssignPayload))
export const TicketUpdate = command("ticket.update", Schema.Struct(ticketUpdatePayload))
export const TicketDependencyAdd = command("ticket.dependency.add", ticketDependencyPayload)
export const TicketDependencyRemove = command("ticket.dependency.remove", ticketDependencyPayload)
export const ExecutionStart = command("execution.start", Schema.Struct(executionStartPayload))
export const KanbanColumnCreate = command("kanbanColumn.create", Schema.Struct(columnCreatePayload))
export const KanbanColumnUpdate = command("kanbanColumn.update", Schema.Struct(columnUpdatePayload))
export const KanbanColumnMove = command("kanbanColumn.move", Schema.Struct(columnMovePayload))
export const KanbanColumnDelete = command("kanbanColumn.delete", Schema.Struct(columnDeletePayload))
/** Commande système émise à la création d'un projet, jamais soumise directement par le client. */
export const BoardInitialize = command("board.initialize", boardInitializePayload)

export const TicketCommand = Schema.Union([
  TicketCreate,
  TicketMove,
  TicketComplete,
  TicketReopen,
  TicketArchive,
  TicketRestore,
  TicketAssign,
  TicketUpdate,
  TicketDependencyAdd,
  TicketDependencyRemove,
  ExecutionStart,
  KanbanColumnCreate,
  KanbanColumnUpdate,
  KanbanColumnMove,
  KanbanColumnDelete,
  BoardInitialize,
])
export type TicketCommand = (typeof TicketCommand)["Type"]
