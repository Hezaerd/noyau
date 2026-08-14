import { Schema } from "effect"

const Uuid = Schema.String.check(Schema.isUUID())

export const ProjectId = Uuid.pipe(Schema.brand("ProjectId"))
export type ProjectId = (typeof ProjectId)["Type"]

export const RepositoryId = Uuid.pipe(Schema.brand("RepositoryId"))
export type RepositoryId = (typeof RepositoryId)["Type"]

export const ChannelId = Uuid.pipe(Schema.brand("ChannelId"))
export type ChannelId = (typeof ChannelId)["Type"]

export const ThreadId = Uuid.pipe(Schema.brand("ThreadId"))
export type ThreadId = (typeof ThreadId)["Type"]

export const MessageId = Uuid.pipe(Schema.brand("MessageId"))
export type MessageId = (typeof MessageId)["Type"]

export const KanbanColumnId = Uuid.pipe(Schema.brand("KanbanColumnId"))
export type KanbanColumnId = (typeof KanbanColumnId)["Type"]

export const TicketId = Uuid.pipe(Schema.brand("TicketId"))
export type TicketId = (typeof TicketId)["Type"]

export const LabelId = Uuid.pipe(Schema.brand("LabelId"))
export type LabelId = (typeof LabelId)["Type"]

export const ChecklistItemId = Uuid.pipe(Schema.brand("ChecklistItemId"))
export type ChecklistItemId = (typeof ChecklistItemId)["Type"]

export const AttachmentId = Uuid.pipe(Schema.brand("AttachmentId"))
export type AttachmentId = (typeof AttachmentId)["Type"]

export const AgentProfileId = Uuid.pipe(Schema.brand("AgentProfileId"))
export type AgentProfileId = (typeof AgentProfileId)["Type"]

export const ExecutionId = Uuid.pipe(Schema.brand("ExecutionId"))
export type ExecutionId = (typeof ExecutionId)["Type"]

export const AttemptId = Uuid.pipe(Schema.brand("AttemptId"))
export type AttemptId = (typeof AttemptId)["Type"]

export const AgentRunId = Uuid.pipe(Schema.brand("AgentRunId"))
export type AgentRunId = (typeof AgentRunId)["Type"]

export const ArtifactId = Uuid.pipe(Schema.brand("ArtifactId"))
export type ArtifactId = (typeof ArtifactId)["Type"]

export const ApprovalId = Uuid.pipe(Schema.brand("ApprovalId"))
export type ApprovalId = (typeof ApprovalId)["Type"]

export const CapabilityGrantId = Uuid.pipe(Schema.brand("CapabilityGrantId"))
export type CapabilityGrantId = (typeof CapabilityGrantId)["Type"]

export const CommandId = Uuid.pipe(Schema.brand("CommandId"))
export type CommandId = (typeof CommandId)["Type"]

export const EventId = Uuid.pipe(Schema.brand("EventId"))
export type EventId = (typeof EventId)["Type"]

export const CorrelationId = Uuid.pipe(Schema.brand("CorrelationId"))
export type CorrelationId = (typeof CorrelationId)["Type"]

/**
 * Identité d'un acteur : humain, agent ou système.
 * Pas un UUID — format libre type `human:hezaerd`, `agent:marion`, `system`.
 */
export const ActorId = Schema.NonEmptyString.pipe(Schema.brand("ActorId"))
export type ActorId = (typeof ActorId)["Type"]

/** Version du protocole portée par chaque commande et événement. */
export const SchemaVersion = Schema.Literal(1)
export type SchemaVersion = (typeof SchemaVersion)["Type"]
