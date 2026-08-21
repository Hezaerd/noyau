import type { Rejection } from "@noyau/protocol/receipts"

import type { AppFailure } from "./app-failure"

export type FailureOperation =
  | "clipboard.write"
  | "project.delete"
  | "project.folder.submit"
  | "project.subscribe"
  | "shell.subscribe"
  | "thread.archive"
  | "thread.rename"
  | "thread.subscribe"
  | "thread.ticket.link"
  | "thread.turn.interrupt"
  | "thread.turn.respond"
  | "thread.turn.start"
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
      return "Ce Project existe déjà."
    case "ProjectNotFound":
      return "Ce Project n’existe plus."
    case "WorkspaceRootConflict":
      return "Ce dossier est déjà relié à un autre Project."
    case "WorkspaceRootUnavailable":
      return "Le dossier du Project n’est plus accessible."
    case "WorkspaceRootNotFound":
      return "Le dossier sélectionné est introuvable."
    case "WorkspaceRootNotDirectory":
      return "Le chemin sélectionné n’est pas un dossier."
    case "ProjectUnavailable":
      return "Ce Project est indisponible tant que son dossier n’est pas relié."
    case "TicketAlreadyExists":
      return "Ce Ticket existe déjà."
    case "TicketNotFound":
      return "Ce Ticket n’existe plus."
    case "KanbanColumnAlreadyExists":
      return "Cette colonne existe déjà."
    case "KanbanColumnNotFound":
      return "Cette colonne n’existe plus."
    case "InvalidTicketPlacement":
      return "Le Ticket ne peut pas être placé à cet endroit."
    case "InvalidColumnPlacement":
      return "La colonne ne peut pas être placée à cet endroit."
    case "ProtectedDoneColumn":
      return "La colonne Done est protégée."
    case "ColumnDestinationRequired":
      return "Choisis une colonne de destination."
    case "DoneColumnDestinationForbidden":
      return "Choisis une colonne active comme destination."
    case "DoneColumnCreationForbidden":
      return "Un Ticket ne peut pas être créé directement dans Done."
    case "TicketDependencyAlreadyExists":
      return "Cette dépendance existe déjà."
    case "TicketDependencyNotFound":
      return "Cette dépendance n’existe plus."
    case "TicketSelfDependency":
      return "Un Ticket ne peut pas dépendre de lui-même."
    case "TicketDependencyCycle":
      return "Cette dépendance créerait une boucle."
    case "TicketAlreadyArchived":
      return "Ce Ticket est déjà archivé."
    case "TicketNotArchived":
      return "Ce Ticket n’est pas archivé."
    case "TicketAlreadyCompleted":
      return "Ce Ticket est déjà terminé."
    case "TicketNotCompleted":
      return "Ce Ticket n’est pas terminé."
    case "OpenDependenciesConfirmationRequired":
      return "Ce Ticket dépend encore de Tickets ouverts. Confirme sa complétion pour continuer."
    case "TicketThreadAlreadyLinked":
      return "Ce Thread est déjà lié au Ticket."
    case "TicketThreadNotLinked":
      return "Ce Thread n’est plus lié au Ticket."
    case "TicketThreadProjectMismatch":
      return "Le Ticket et le Thread n’appartiennent pas au même Project."
    case "ThreadAlreadyExists":
      return "Ce Thread existe déjà."
    case "ThreadNotFound":
      return "Ce Thread n’existe plus."
    case "ThreadArchived":
      return "Restaure ce Thread avant de poursuivre."
    case "ThreadNotArchived":
      return "Ce Thread n’est pas archivé."
    case "TurnAlreadyActive":
      return "Un Turn est déjà en cours dans ce Thread."
    case "TurnNotFound":
      return "Ce Turn n’existe plus."
    case "ImageAttachmentRejected":
      return "Les images ne sont pas encore prises en charge dans les Threads."
    case "ApprovalRequestNotFound":
      return "Cette demande d’approbation n’est plus active."
    case "SessionNotRunning":
      return "La Session de ce Thread n’est pas en cours."
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
    case "Interrupted":
      return {
        surface: "silent",
        tone: "warning",
        title: "Opération interrompue",
        persistence: "transient",
      }
    case "InvalidInput":
      return {
        surface: surfaceFor(context),
        tone: "warning",
        title: failure.message ?? "Vérifie les informations saisies.",
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
        ? { ...presentation, recovery: { action: "rebind", label: "Relier le dossier" } }
        : presentation
    }
    case "CommandConflict":
      return {
        surface: surfaceFor(context),
        tone: "critical",
        title: "Cette opération entre en conflit avec une tentative précédente.",
        description: "Recharge les données avant de réessayer.",
        persistence: "until-dismissed",
        recovery: { action: "reload", label: "Recharger" },
        dedupeKey: dedupeKey(context),
      }
    case "Unauthorized":
      return {
        surface: context.hasUsableData ? "banner" : "page",
        tone: "critical",
        title: "La connexion locale n’est plus autorisée.",
        description: "Redémarre Noyau pour renouveler la session locale.",
        persistence: "until-recovered",
        dedupeKey: dedupeKey(context),
      }
    case "Unavailable":
      if (context.initiatedByUser) {
        return {
          surface: surfaceFor(context),
          tone: "warning",
          title: "L’opération n’a pas pu être confirmée.",
          description: "Noyau actualise l’état avant une nouvelle tentative.",
          persistence: "until-dismissed",
          dedupeKey: dedupeKey(context),
        }
      }
      return {
        surface: context.hasUsableData ? "banner" : "page",
        tone: "warning",
        title: "Le control plane est temporairement indisponible.",
        description: `Service concerné : ${failure.service}.`,
        persistence: "until-recovered",
        recovery: { action: "retry", label: "Réessayer" },
        dedupeKey: dedupeKey(context),
      }
    case "TransportFailure":
      if (context.initiatedByUser) {
        return {
          surface: surfaceFor(context),
          tone: "warning",
          title: "La connexion a été interrompue pendant l’opération.",
          description: "Noyau actualise l’état avant une nouvelle tentative.",
          persistence: "until-dismissed",
          dedupeKey: dedupeKey(context),
        }
      }
      return {
        surface: context.hasUsableData ? "banner" : "page",
        tone: "warning",
        title: context.hasUsableData ? "Reconnexion au control plane…" : "Connexion impossible",
        description: context.hasUsableData
          ? "Les données affichées restent disponibles pendant la reconnexion."
          : "Noyau essaie de rétablir la connexion locale.",
        persistence: "until-recovered",
        recovery: { action: "retry", label: "Réessayer" },
        dedupeKey: dedupeKey(context),
      }
    case "UnexpectedFailure":
      return {
        surface: context.hasUsableData ? "banner" : "page",
        tone: "critical",
        title: "Une erreur inattendue est survenue.",
        description: `Incident ${failure.incidentId}.`,
        persistence: "until-dismissed",
        recovery: { action: "reload", label: "Recharger" },
        dedupeKey: dedupeKey(context),
      }
    default:
      return assertNever(failure)
  }
}
