import { Schema } from "effect"

const Uuid = Schema.String.check(Schema.isUUID())

export const EnvironmentId = Uuid.pipe(Schema.brand("EnvironmentId"))
export type EnvironmentId = (typeof EnvironmentId)["Type"]

export const ProjectId = Uuid.pipe(Schema.brand("ProjectId"))
export type ProjectId = (typeof ProjectId)["Type"]

export const ThreadId = Uuid.pipe(Schema.brand("ThreadId"))
export type ThreadId = (typeof ThreadId)["Type"]

export const TurnId = Uuid.pipe(Schema.brand("TurnId"))
export type TurnId = (typeof TurnId)["Type"]

export const KanbanColumnId = Uuid.pipe(Schema.brand("KanbanColumnId"))
export type KanbanColumnId = (typeof KanbanColumnId)["Type"]

export const TicketId = Uuid.pipe(Schema.brand("TicketId"))
export type TicketId = (typeof TicketId)["Type"]

export const CommandId = Uuid.pipe(Schema.brand("CommandId"))
export type CommandId = (typeof CommandId)["Type"]

export const EventId = Uuid.pipe(Schema.brand("EventId"))
export type EventId = (typeof EventId)["Type"]

export const CorrelationId = Uuid.pipe(Schema.brand("CorrelationId"))
export type CorrelationId = (typeof CorrelationId)["Type"]

/**
 * Identité d'un acteur : humain ou système.
 * Pas un UUID — format libre type `human:hezaerd`, `system`.
 */
export const ActorId = Schema.NonEmptyString.pipe(Schema.brand("ActorId"))
export type ActorId = (typeof ActorId)["Type"]

/** Identifiant opaque d'une permission ou d'un user-input ACP. */
export const ApprovalRequestId = Schema.NonEmptyString.pipe(Schema.brand("ApprovalRequestId"))
export type ApprovalRequestId = (typeof ApprovalRequestId)["Type"]

/** Identifiant opaque d'un cycle d'outil ACP. */
export const ToolCallId = Schema.NonEmptyString.pipe(Schema.brand("ToolCallId"))
export type ToolCallId = (typeof ToolCallId)["Type"]

/**
 * Identifiant opaque de session provider, porté seulement par `resumeCursor`.
 * Ce n'est pas un id métier de Session : la Session est une projection 0..1 du Thread.
 */
export const ProviderSessionId = Schema.NonEmptyString.pipe(Schema.brand("ProviderSessionId"))
export type ProviderSessionId = (typeof ProviderSessionId)["Type"]

/** Position globale du journal, utilisée comme `afterSequence`. */
export const Sequence = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand("Sequence"),
)
export type Sequence = (typeof Sequence)["Type"]

/** Version du protocole portée par chaque commande et événement. */
export const SchemaVersion = Schema.Literal(1)
export type SchemaVersion = (typeof SchemaVersion)["Type"]
