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

const ticketCreatePayload = {
  ticketId: TicketId,
  title: Schema.NonEmptyString,
  placement: TicketPlacement,
  sourceThreadId: Schema.optionalKey(ThreadId),
} as const

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
  description: Schema.optionalKey(Schema.String),
  priority: Schema.optionalKey(TicketPriority),
  dueAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtcFromString)),
} as const

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

const request = <Tag extends string, Fields extends Schema.Struct.Fields>(
  tag: Tag,
  fields: Fields,
) => Schema.TaggedStruct(tag, { ...requestMeta, payload: Schema.Struct(fields) })

const command = <Tag extends string, Fields extends Schema.Struct.Fields>(
  tag: Tag,
  fields: Fields,
) => Schema.TaggedStruct(tag, { ...commandMeta, payload: Schema.Struct(fields) })

export const TicketCreateRequest = request("ticket.create", ticketCreatePayload)
export const TicketMoveRequest = request("ticket.move", ticketMovePayload)
export const TicketCompleteRequest = request("ticket.complete", ticketClosePayload)
export const TicketReopenRequest = request("ticket.reopen", ticketIdPayload)
export const TicketArchiveRequest = request("ticket.archive", ticketClosePayload)
export const TicketRestoreRequest = request("ticket.restore", ticketIdPayload)
export const TicketAssignRequest = request("ticket.assign", ticketAssignPayload)
export const TicketUpdateRequest = request("ticket.update", ticketUpdatePayload)
export const ExecutionStartRequest = request("execution.start", executionStartPayload)
export const KanbanColumnCreateRequest = request("kanbanColumn.create", columnCreatePayload)
export const KanbanColumnUpdateRequest = request("kanbanColumn.update", columnUpdatePayload)
export const KanbanColumnMoveRequest = request("kanbanColumn.move", columnMovePayload)
export const KanbanColumnDeleteRequest = request("kanbanColumn.delete", columnDeletePayload)

export const TicketCommandRequest = Schema.Union([
  TicketCreateRequest,
  TicketMoveRequest,
  TicketCompleteRequest,
  TicketReopenRequest,
  TicketArchiveRequest,
  TicketRestoreRequest,
  TicketAssignRequest,
  TicketUpdateRequest,
  ExecutionStartRequest,
  KanbanColumnCreateRequest,
  KanbanColumnUpdateRequest,
  KanbanColumnMoveRequest,
  KanbanColumnDeleteRequest,
])
export type TicketCommandRequest = (typeof TicketCommandRequest)["Type"]
export const decodeTicketCommandRequest = Schema.decodeUnknownEffect(TicketCommandRequest)

export const TicketCreate = command("ticket.create", ticketCreatePayload)
export const TicketMove = command("ticket.move", ticketMovePayload)
export const TicketComplete = command("ticket.complete", ticketClosePayload)
export const TicketReopen = command("ticket.reopen", ticketIdPayload)
export const TicketArchive = command("ticket.archive", ticketClosePayload)
export const TicketRestore = command("ticket.restore", ticketIdPayload)
export const TicketAssign = command("ticket.assign", ticketAssignPayload)
export const TicketUpdate = command("ticket.update", ticketUpdatePayload)
export const ExecutionStart = command("execution.start", executionStartPayload)
export const KanbanColumnCreate = command("kanbanColumn.create", columnCreatePayload)
export const KanbanColumnUpdate = command("kanbanColumn.update", columnUpdatePayload)
export const KanbanColumnMove = command("kanbanColumn.move", columnMovePayload)
export const KanbanColumnDelete = command("kanbanColumn.delete", columnDeletePayload)

export const TicketCommand = Schema.Union([
  TicketCreate,
  TicketMove,
  TicketComplete,
  TicketReopen,
  TicketArchive,
  TicketRestore,
  TicketAssign,
  TicketUpdate,
  ExecutionStart,
  KanbanColumnCreate,
  KanbanColumnUpdate,
  KanbanColumnMove,
  KanbanColumnDelete,
])
export type TicketCommand = (typeof TicketCommand)["Type"]
