import type { Rejection } from "@noyau/contracts/receipts"

import type { AppFailure } from "./app-failure"

export type FailureOperation =
  | "clipboard.write"
  | "project.delete"
  | "project.folder.pick"
  | "project.folder.submit"
  | "project.meta.update"
  | "project.agent-integration"
  | "project.subscribe"
  | "shell.subscribe"
  | "thread.create"
  | "thread.delete"
  | "thread.fork"
  | "thread.settle"
  | "thread.unsettle"
  | "thread.model-selection.set"
  | "thread.rename"
  | "thread.title.regenerate"
  | "thread.subscribe"
  | "thread.ticket.link"
  | "thread.turn.interrupt"
  | "thread.turn.respond"
  | "thread.turn.start"
  | "thread.git.action"
  | "thread.open-in"
  | "ticket.command"

export type FailureScope = "action" | "field" | "project" | "resource" | "shell"

export interface FailureContext {
  readonly operation: FailureOperation
  readonly scope: FailureScope
  readonly initiatedByUser: boolean
  readonly hasUsableData: boolean
}

export type FailureSurface = "banner" | "inline" | "page" | "silent" | "toast"
export type FailureTone = "critical" | "warning"
export type FailurePersistence = "transient" | "until-dismissed" | "until-recovered"
export type FailureRecoveryAction = "navigate-away" | "rebind" | "reload" | "retry"

export interface FailurePresentation {
  readonly surface: FailureSurface
  readonly tone: FailureTone
  readonly title: string
  readonly description?: string
  readonly persistence: FailurePersistence
  readonly recovery?: {
    readonly action: FailureRecoveryAction
    readonly label: string
  }
  readonly dedupeKey?: string
}

const assertNever = (value: never): never => {
  throw new Error(`Unhandled failure variant: ${String(value)}`)
}

const rejectionMessage = (rejection: Rejection): string => {
  switch (rejection._tag) {
    case "ProjectAlreadyExists":
      return "This Project already exists."
    case "ProjectNotFound":
      return "This Project no longer exists."
    case "WorkspaceRootConflict":
      return "This folder is already linked to another Project."
    case "WorkspaceRootUnavailable":
      return "The Project folder is no longer reachable."
    case "WorkspaceRootNotFound":
      return "The selected folder could not be found."
    case "WorkspaceRootNotDirectory":
      return "The selected path is not a folder."
    case "ProjectUnavailable":
      return "This Project is unavailable until its folder is linked."
    case "TicketAlreadyExists":
      return "This Ticket already exists."
    case "TicketNotFound":
      return "This Ticket no longer exists."
    case "KanbanColumnAlreadyExists":
      return "This column already exists."
    case "KanbanColumnNotFound":
      return "This column no longer exists."
    case "InvalidTicketPlacement":
      return "The Ticket cannot be placed there."
    case "InvalidColumnPlacement":
      return "The column cannot be placed there."
    case "ProtectedDoneColumn":
      return "The Done column is protected."
    case "ColumnDestinationRequired":
      return "Choose a destination column."
    case "DoneColumnDestinationForbidden":
      return "Choose an active column as the destination."
    case "DoneColumnCreationForbidden":
      return "A Ticket cannot be created directly in Done."
    case "TicketDependencyAlreadyExists":
      return "This dependency already exists."
    case "TicketDependencyNotFound":
      return "This dependency no longer exists."
    case "TicketSelfDependency":
      return "A Ticket cannot depend on itself."
    case "TicketDependencyCycle":
      return "This dependency would create a cycle."
    case "TicketAlreadyArchived":
      return "This Ticket is already archived."
    case "TicketNotArchived":
      return "This Ticket is not archived."
    case "TicketAlreadyCompleted":
      return "This Ticket is already completed."
    case "TicketNotCompleted":
      return "This Ticket is not completed."
    case "OpenDependenciesConfirmationRequired":
      return "This Ticket still depends on open Tickets. Confirm completion to continue."
    case "TicketThreadAlreadyLinked":
      return "This Thread is already linked to the Ticket."
    case "TicketThreadNotLinked":
      return "This Thread is no longer linked to the Ticket."
    case "TicketThreadProjectMismatch":
      return "The Ticket and Thread do not belong to the same Project."
    case "ThreadAlreadyExists":
      return "This Thread already exists."
    case "ThreadNotFound":
      return "This Thread no longer exists."
    case "ThreadForkOriginMismatch":
      return "This Thread is not the requested fork."
    case "ThreadArchived":
      return "This Thread is no longer available."
    case "ThreadNotSettleable":
      return "This Thread still has activity in progress and cannot be settled."
    case "TurnAlreadyActive":
      return "A Turn is already running in this Thread."
    case "TurnNotFound":
      return "This Turn no longer exists."
    case "ImageAttachmentRejected":
      return "This image could not be attached."
    case "ApprovalRequestNotFound":
      return "This approval request is no longer active."
    case "SessionNotRunning":
      return "This Thread's Session is not running."
    default:
      return assertNever(rejection)
  }
}

const surfaceFor = (context: FailureContext): FailureSurface => {
  if (!context.initiatedByUser) {
    return context.hasUsableData ? "banner" : "page"
  }
  if (context.scope === "field" || context.scope === "action") {
    return "inline"
  }
  return context.scope === "resource" ? "page" : "toast"
}

const dedupeKey = (context: FailureContext): string => `${context.operation}:${context.scope}`

export const presentFailure = (
  failure: AppFailure,
  context: FailureContext,
): FailurePresentation => {
  switch (failure._tag) {
    case "AgentIntegrationFailure":
      const integrationPresentation: FailurePresentation = {
        surface: surfaceFor(context),
        tone: "warning",
        title:
          failure.reason === "conflict"
            ? "The Noyau skill has local changes."
            : failure.reason === "unsafe-path"
              ? "The skills folder is outside the Project."
              : "The skills folder is not reachable.",
        persistence: "until-dismissed",
        dedupeKey: dedupeKey(context),
      }
      return failure.reason === "conflict"
        ? {
            ...integrationPresentation,
            description:
              "Noyau will not overwrite it. Move or reconcile the existing folder before retrying.",
          }
        : integrationPresentation
    case "Interrupted":
      return {
        surface: "silent",
        tone: "warning",
        title: "Operation interrupted",
        persistence: "transient",
      }
    case "InvalidInput":
      return {
        surface: surfaceFor(context),
        tone: "warning",
        title: failure.message ?? "Check the information you entered.",
        persistence: "until-dismissed",
        dedupeKey: dedupeKey(context),
      }
    case "Rejected": {
      const rebind =
        failure.rejection._tag === "WorkspaceRootUnavailable" ||
        failure.rejection._tag === "ProjectUnavailable"
      const presentation: FailurePresentation = {
        surface:
          rebind && !context.initiatedByUser
            ? context.hasUsableData
              ? "banner"
              : "page"
            : surfaceFor(context),
        tone: rebind ? "warning" : "critical",
        title: rejectionMessage(failure.rejection),
        persistence: rebind ? "until-recovered" : "until-dismissed",
        dedupeKey: dedupeKey(context),
      }
      return rebind
        ? { ...presentation, recovery: { action: "rebind", label: "Link folder" } }
        : presentation
    }
    case "CommandConflict":
      return {
        surface: surfaceFor(context),
        tone: "critical",
        title: "This operation conflicts with a previous attempt.",
        description: "Reload the data before retrying.",
        persistence: "until-dismissed",
        recovery: { action: "reload", label: "Reload" },
        dedupeKey: dedupeKey(context),
      }
    case "Unauthorized":
      return {
        surface: context.hasUsableData ? "banner" : "page",
        tone: "critical",
        title: "The local connection is no longer authorized.",
        description: "Restart Noyau to renew the local session.",
        persistence: "until-recovered",
        dedupeKey: dedupeKey(context),
      }
    case "Unavailable":
      if (context.initiatedByUser) {
        return {
          surface: surfaceFor(context),
          tone: "warning",
          title: "The operation could not be confirmed.",
          description: "Noyau is refreshing state before another attempt.",
          persistence: "until-dismissed",
          dedupeKey: dedupeKey(context),
        }
      }
      return {
        surface: context.hasUsableData ? "banner" : "page",
        tone: "warning",
        title: "The control plane is temporarily unavailable.",
        description: `Affected service: ${failure.service}.`,
        persistence: "until-recovered",
        recovery: { action: "retry", label: "Retry" },
        dedupeKey: dedupeKey(context),
      }
    case "TransportFailure":
      if (context.initiatedByUser) {
        return {
          surface: surfaceFor(context),
          tone: "warning",
          title: "The connection dropped during the operation.",
          description: "Noyau is refreshing state before another attempt.",
          persistence: "until-dismissed",
          dedupeKey: dedupeKey(context),
        }
      }
      return {
        surface: context.hasUsableData ? "banner" : "page",
        tone: "warning",
        title: context.hasUsableData ? "Reconnecting to the control plane…" : "Unable to connect",
        description: context.hasUsableData
          ? "Shown data stays available while reconnecting."
          : "Noyau is trying to restore the local connection.",
        persistence: "until-recovered",
        recovery: { action: "retry", label: "Retry" },
        dedupeKey: dedupeKey(context),
      }
    case "UnexpectedFailure": {
      const backgroundSurface: FailureSurface = context.hasUsableData ? "banner" : "page"
      return {
        surface: context.initiatedByUser ? surfaceFor(context) : backgroundSurface,
        tone: "critical",
        title: "An unexpected error occurred.",
        description: `Incident ${failure.incidentId}.`,
        persistence: "until-dismissed",
        recovery: { action: "reload", label: "Reload" },
        dedupeKey: dedupeKey(context),
      }
    }
    default:
      return assertNever(failure)
  }
}
