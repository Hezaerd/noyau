import type { BoardSnapshot } from "@noyau/protocol/board"
import { ProviderUserInputAnswers, UserInputQuestion } from "@noyau/protocol/entities/approvals"
import { TicketPriority } from "@noyau/protocol/entities/ticket"
import {
  ApprovalRequestId,
  CommandId,
  KanbanColumnId,
  ProjectId,
  Sequence,
  TicketId,
} from "@noyau/protocol/ids"
import type { Rejection } from "@noyau/protocol/receipts"
import {
  TicketArchiveRequest,
  TicketCompleteRequest,
  TicketCreateRequest,
  TicketDependencyAddRequest,
  TicketDependencyRemoveRequest,
  TicketMoveRequest,
  TicketReopenRequest,
  TicketRestoreRequest,
  TicketThreadLinkRequest,
  TicketThreadUnlinkRequest,
  TicketUpdateRequest,
} from "@noyau/protocol/ticket/commands"
import { ControlPlane } from "@noyau/server/control-plane"
import {
  TurnUserInputRegistry,
  UserInputTurnInactive,
} from "@noyau/server/provider/turn-user-input-registry"
import { Crypto, Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"

import { readBoardSnapshot } from "./board-snapshot.ts"
import {
  McpCapabilityMissing,
  McpInvocationContext,
  requireMcpCapability,
} from "./mcp-invocation-context.ts"

const TicketListState = Schema.Literals(["open", "done", "all"] as const)
const TicketActionability = Schema.Literals(["actionable", "blocked", "all"] as const)

const OperationId = Schema.optionalKey(CommandId)

const TicketDependencyView = Schema.Struct({
  ticketId: TicketId,
  title: Schema.NonEmptyString,
  done: Schema.Boolean,
})

const ColumnListItem = Schema.Struct({
  columnId: KanbanColumnId,
  name: Schema.NonEmptyString,
  done: Schema.Boolean,
  rank: Schema.NonEmptyString,
})

const TicketListItem = Schema.Struct({
  ticketId: TicketId,
  columnId: KanbanColumnId,
  columnName: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  priority: TicketPriority,
  dueAt: Schema.optionalKey(Schema.DateTimeUtcFromString),
  done: Schema.Boolean,
  actionable: Schema.Boolean,
  blockedBy: Schema.Array(TicketDependencyView),
  linkedToCurrentThread: Schema.Boolean,
})

export const TicketListResult = Schema.Struct({
  projectId: ProjectId,
  snapshotSequence: Sequence,
  columns: Schema.Array(ColumnListItem),
  tickets: Schema.Array(TicketListItem),
})

export const TicketGetResult = Schema.Struct({
  projectId: ProjectId,
  snapshotSequence: Sequence,
  ticket: TicketListItem,
})

export const TicketMutationResult = Schema.Struct({
  sequence: Sequence,
  ticketId: TicketId,
})

export class TicketListUnavailable extends Schema.TaggedError<TicketListUnavailable>()(
  "TicketListUnavailable",
  { message: Schema.NonEmptyString },
) {}

export class TicketNotFoundInBoard extends Schema.TaggedError<TicketNotFoundInBoard>()(
  "TicketNotFoundInBoard",
  { ticketId: TicketId },
) {}

export class TicketMutationRejected extends Schema.TaggedError<TicketMutationRejected>()(
  "TicketMutationRejected",
  {
    reason: Schema.NonEmptyString,
    message: Schema.NonEmptyString,
  },
) {}

export class TicketMutationUnavailable extends Schema.TaggedError<TicketMutationUnavailable>()(
  "TicketMutationUnavailable",
  { message: Schema.NonEmptyString },
) {}

const mutationFailures = Schema.Union([
  McpCapabilityMissing,
  TicketMutationRejected,
  TicketMutationUnavailable,
])

const rejectionMessage = (error: Rejection): string => {
  switch (error._tag) {
    case "TicketNotFound":
      return `Ticket ${error.ticketId} was not found.`
    case "TicketAlreadyExists":
      return `Ticket ${error.ticketId} already exists.`
    case "TicketAlreadyArchived":
      return `Ticket ${error.ticketId} is already archived.`
    case "TicketNotArchived":
      return `Ticket ${error.ticketId} is not archived.`
    case "TicketAlreadyCompleted":
      return `Ticket ${error.ticketId} is already completed.`
    case "TicketNotCompleted":
      return `Ticket ${error.ticketId} is not completed.`
    case "KanbanColumnNotFound":
      return `Column ${error.columnId} was not found.`
    case "InvalidTicketPlacement":
      return "The requested ticket placement is invalid."
    case "DoneColumnCreationForbidden":
      return "Tickets cannot be created directly in the Done column."
    case "OpenDependenciesConfirmationRequired":
      return "Open prerequisites remain; pass acknowledgeOpenDependencies=true to confirm."
    case "TicketDependencyAlreadyExists":
      return "That dependency already exists."
    case "TicketDependencyNotFound":
      return "That dependency was not found."
    case "TicketSelfDependency":
      return "A ticket cannot depend on itself."
    case "TicketDependencyCycle":
      return "That dependency would create a cycle."
    case "TicketThreadAlreadyLinked":
      return "That ticket is already linked to this thread."
    case "TicketThreadNotLinked":
      return "That ticket is not linked to this thread."
    case "TicketThreadProjectMismatch":
      return "That thread does not belong to this project."
    default:
      return `The board rejected the mutation (${error._tag}).`
  }
}

const dispatchTicketMutation = Effect.fn("NoyauMcpTools.dispatchTicketMutation")(function* (
  request:
    | (typeof TicketCreateRequest)["Type"]
    | (typeof TicketUpdateRequest)["Type"]
    | (typeof TicketMoveRequest)["Type"]
    | (typeof TicketCompleteRequest)["Type"]
    | (typeof TicketReopenRequest)["Type"]
    | (typeof TicketArchiveRequest)["Type"]
    | (typeof TicketRestoreRequest)["Type"]
    | (typeof TicketDependencyAddRequest)["Type"]
    | (typeof TicketDependencyRemoveRequest)["Type"]
    | (typeof TicketThreadLinkRequest)["Type"]
    | (typeof TicketThreadUnlinkRequest)["Type"],
  ticketId: TicketId,
) {
  const invocation = yield* requireMcpCapability("board:write")
  const controlPlane = yield* ControlPlane
  const result = yield* controlPlane.dispatch(request, invocation.actorId).pipe(
    Effect.mapError((error) => {
      if (error._tag === "CommandIdConflict") {
        return new TicketMutationUnavailable({
          message: "This operationId was already used for a different command.",
        })
      }
      if (error._tag === "ServiceUnavailable") {
        return new TicketMutationUnavailable({
          message: "The Noyau control plane is temporarily unavailable.",
        })
      }
      return new TicketMutationRejected({
        reason: error._tag,
        message: rejectionMessage(error),
      })
    }),
  )
  return { sequence: result.sequence, ticketId }
})

const nextCommandId = Effect.fn("NoyauMcpTools.nextCommandId")(function* (
  operationId: CommandId | undefined,
) {
  if (operationId !== undefined) {
    return operationId
  }
  const crypto = yield* Crypto.Crypto
  return CommandId.make(yield* crypto.randomUUIDv4.pipe(Effect.orDie))
})

const uuidFromDigest = (digest: Uint8Array) => {
  const bytes = digest.slice(0, 16)
  const versionByte = bytes[6]
  const variantByte = bytes[8]
  if (versionByte === undefined || variantByte === undefined) {
    throw new Error("SHA-256 digest is shorter than 16 bytes")
  }
  bytes[6] = (versionByte & 0x0f) | 0x50
  bytes[8] = (variantByte & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Stable ticket id for create retries that reuse the same operationId. */
const nextTicketId = Effect.fn("NoyauMcpTools.nextTicketId")(function* (
  operationId: CommandId | undefined,
) {
  const crypto = yield* Crypto.Crypto
  if (operationId === undefined) {
    return TicketId.make(yield* crypto.randomUUIDv4.pipe(Effect.orDie))
  }
  const digest = yield* crypto
    .digest("SHA-256", new TextEncoder().encode(`noyau:mcp:ticket:${operationId}`))
    .pipe(Effect.orDie)
  return TicketId.make(uuidFromDigest(digest))
})

const ticketPlacement = (input: {
  readonly columnId: KanbanColumnId
  readonly beforeTicketId?: TicketId
  readonly afterTicketId?: TicketId
}) => {
  const placement = { columnId: input.columnId }
  if (input.beforeTicketId !== undefined) {
    Object.assign(placement, { beforeTicketId: input.beforeTicketId })
  }
  if (input.afterTicketId !== undefined) {
    Object.assign(placement, { afterTicketId: input.afterTicketId })
  }
  return placement
}

const ticketViewFromSnapshot = (
  snapshot: BoardSnapshot,
  ticketId: TicketId,
  currentThreadId: string,
) => {
  const ticket = snapshot.tickets.find((item) => item.id === ticketId)
  if (ticket === undefined) {
    return undefined
  }
  const column = snapshot.columns.find((item) => item.id === ticket.columnId)
  if (column === undefined) {
    return undefined
  }
  const ticketsById = new Map(snapshot.tickets.map((item) => [item.id, item]))
  const blockedBy = snapshot.ticketDependencies
    .filter((dependency) => dependency.ticketId === ticket.id)
    .flatMap((dependency) => {
      const prerequisite = ticketsById.get(dependency.dependsOnTicketId)
      return prerequisite === undefined
        ? []
        : [
            {
              ticketId: prerequisite.id,
              title: prerequisite.title,
              done: prerequisite.done,
            },
          ]
    })
  const actionable = !ticket.done && blockedBy.every((dependency) => dependency.done)
  const base = {
    ticketId: ticket.id,
    columnId: column.id,
    columnName: column.name,
    title: ticket.title,
    priority: ticket.priority,
    done: ticket.done,
    actionable,
    blockedBy,
    linkedToCurrentThread: snapshot.ticketThreads.some(
      (link) => link.ticketId === ticket.id && link.threadId === currentThreadId,
    ),
  }
  const withDescription =
    ticket.description === undefined ? base : { ...base, description: ticket.description }
  return ticket.dueAt === undefined ? withDescription : { ...withDescription, dueAt: ticket.dueAt }
}

export const NoyauTicketListTool = Tool.make("noyau_ticket_list", {
  description:
    "List active Noyau tickets and columns in this agent's project. Defaults to open tickets; filter by actionability to find work whose dependencies are complete or blocked.",
  parameters: Schema.Struct({
    state: Schema.optionalKey(TicketListState),
    actionability: Schema.optionalKey(TicketActionability),
  }),
  success: TicketListResult,
  failure: Schema.Union([McpCapabilityMissing, TicketListUnavailable]),
  dependencies: [McpInvocationContext, ControlPlane],
})
  .annotate(Tool.Title, "List Noyau tickets")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketGetTool = Tool.make("noyau_ticket_get", {
  description:
    "Read one Noyau ticket by id in this agent's project, including blocked-by and link state.",
  parameters: Schema.Struct({
    ticketId: TicketId,
  }),
  success: TicketGetResult,
  failure: Schema.Union([McpCapabilityMissing, TicketListUnavailable, TicketNotFoundInBoard]),
  dependencies: [McpInvocationContext, ControlPlane],
})
  .annotate(Tool.Title, "Get Noyau ticket")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketCreateTool = Tool.make("noyau_ticket_create", {
  description:
    "Create a durable Noyau ticket in a column. Prefer a distinct unit of work; put acceptance detail in the description via noyau_ticket_update.",
  parameters: Schema.Struct({
    title: Schema.NonEmptyString,
    columnId: KanbanColumnId,
    operationId: OperationId,
    beforeTicketId: Schema.optionalKey(TicketId),
    afterTicketId: Schema.optionalKey(TicketId),
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Create Noyau ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketUpdateTool = Tool.make("noyau_ticket_update", {
  description:
    "Update title, description, priority, or due date of a Noyau ticket. Omit unchanged fields. Pass null to clear description or dueAt.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    operationId: OperationId,
    title: Schema.optionalKey(Schema.NonEmptyString),
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
    priority: Schema.optionalKey(TicketPriority),
    dueAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtcFromString)),
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Update Noyau ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketMoveTool = Tool.make("noyau_ticket_move", {
  description:
    "Move a Noyau ticket into a column. Moving into Done completes it; moving out of Done reopens it. Prefer noyau_ticket_complete / noyau_ticket_reopen when that is the intent.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    columnId: KanbanColumnId,
    operationId: OperationId,
    beforeTicketId: Schema.optionalKey(TicketId),
    afterTicketId: Schema.optionalKey(TicketId),
    acknowledgeOpenDependencies: Schema.optionalKey(Schema.Boolean),
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Move Noyau ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketCompleteTool = Tool.make("noyau_ticket_complete", {
  description:
    "Complete a Noyau ticket by moving it to Done. If open prerequisites remain, confirm with acknowledgeOpenDependencies=true after asking the user.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    operationId: OperationId,
    acknowledgeOpenDependencies: Schema.optionalKey(Schema.Boolean),
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Complete Noyau ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketReopenTool = Tool.make("noyau_ticket_reopen", {
  description: "Reopen a completed Noyau ticket back to its last active column.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    operationId: OperationId,
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Reopen Noyau ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketArchiveTool = Tool.make("noyau_ticket_archive", {
  description:
    "Archive a Noyau ticket so it leaves the active board. Prefer restore instead of recreating it.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    operationId: OperationId,
    acknowledgeOpenDependencies: Schema.optionalKey(Schema.Boolean),
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Archive Noyau ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketRestoreTool = Tool.make("noyau_ticket_restore", {
  description: "Restore an archived Noyau ticket onto the active board.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    operationId: OperationId,
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Restore Noyau ticket")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketDependencyAddTool = Tool.make("noyau_ticket_dependency_add", {
  description:
    "Add a DAG dependency: ticketId depends on dependsOnTicketId (ticketId is blocked by the prerequisite).",
  parameters: Schema.Struct({
    ticketId: TicketId,
    dependsOnTicketId: TicketId,
    operationId: OperationId,
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Add Noyau ticket dependency")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketDependencyRemoveTool = Tool.make("noyau_ticket_dependency_remove", {
  description: "Remove a dependency between two Noyau tickets.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    dependsOnTicketId: TicketId,
    operationId: OperationId,
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Remove Noyau ticket dependency")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketThreadLinkTool = Tool.make("noyau_ticket_thread_link", {
  description:
    "Link a Noyau ticket to the current agent thread. Linking records contribution; it does not claim, start, or complete the ticket.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    operationId: OperationId,
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Link ticket to current thread")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const NoyauTicketThreadUnlinkTool = Tool.make("noyau_ticket_thread_unlink", {
  description:
    "Unlink a Noyau ticket from the current agent thread when the relationship is incorrect.",
  parameters: Schema.Struct({
    ticketId: TicketId,
    operationId: OperationId,
  }),
  success: TicketMutationResult,
  failure: mutationFailures,
  dependencies: [McpInvocationContext, ControlPlane, Crypto.Crypto],
})
  .annotate(Tool.Title, "Unlink ticket from current thread")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)

export const AskQuestionResult = Schema.Struct({
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
})

export const NoyauAskQuestionTool = Tool.make("noyau_ask_question", {
  description:
    "Ask the human structured questions in the Noyau Thread UI and wait for answers. Prefer this over freeform chat for decision frontiers (grilling, design choices). Always include at least two options per question; the UI always offers an Other freeform escape. Put the recommended option first and append (Recommended) to its label. Use allowMultiple only when several answers can be true at once.",
  parameters: Schema.Struct({
    title: Schema.optionalKey(Schema.NonEmptyString),
    questions: Schema.Array(UserInputQuestion).check(Schema.isMinLength(1)),
  }),
  success: AskQuestionResult,
  failure: Schema.Union([McpCapabilityMissing, UserInputTurnInactive]),
  dependencies: [McpInvocationContext, TurnUserInputRegistry, Crypto.Crypto],
})
  .annotate(Tool.Title, "Ask Noyau questions")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false)

export const NoyauMcpToolkit = Toolkit.make(
  NoyauTicketListTool,
  NoyauTicketGetTool,
  NoyauTicketCreateTool,
  NoyauTicketUpdateTool,
  NoyauTicketMoveTool,
  NoyauTicketCompleteTool,
  NoyauTicketReopenTool,
  NoyauTicketArchiveTool,
  NoyauTicketRestoreTool,
  NoyauTicketDependencyAddTool,
  NoyauTicketDependencyRemoveTool,
  NoyauTicketThreadLinkTool,
  NoyauTicketThreadUnlinkTool,
  NoyauAskQuestionTool,
)

const listTickets = Effect.fn("NoyauMcpTools.listTickets")(function* (input: {
  readonly state?: "open" | "done" | "all"
  readonly actionability?: "actionable" | "blocked" | "all"
}) {
  const invocation = yield* requireMcpCapability("board:read")
  const snapshot = yield* readBoardSnapshot(invocation.projectId).pipe(
    Effect.mapError(
      (error) =>
        new TicketListUnavailable({
          message: error.message,
        }),
    ),
  )
  const ticketsById = new Map(snapshot.tickets.map((ticket) => [ticket.id, ticket]))
  const columnsById = new Map(snapshot.columns.map((column) => [column.id, column]))
  const linkedTicketIds = new Set(
    snapshot.ticketThreads
      .filter((link) => link.threadId === invocation.threadId)
      .map((link) => link.ticketId),
  )
  const state = input.state ?? "open"
  const actionability = input.actionability ?? "all"

  const tickets = snapshot.tickets.flatMap((ticket) => {
    const column = columnsById.get(ticket.columnId)
    if (column === undefined) {
      return []
    }
    const blockedBy = snapshot.ticketDependencies
      .filter((dependency) => dependency.ticketId === ticket.id)
      .flatMap((dependency) => {
        const prerequisite = ticketsById.get(dependency.dependsOnTicketId)
        return prerequisite === undefined
          ? []
          : [
              {
                ticketId: prerequisite.id,
                title: prerequisite.title,
                done: prerequisite.done,
              },
            ]
      })
    const actionable = !ticket.done && blockedBy.every((dependency) => dependency.done)
    const blocked = !ticket.done && blockedBy.some((dependency) => !dependency.done)
    const stateMatches = state === "all" || (state === "done" ? ticket.done : !ticket.done)
    const actionabilityMatches =
      actionability === "all" || (actionability === "actionable" ? actionable : blocked)
    if (!stateMatches || !actionabilityMatches) {
      return []
    }
    const base = {
      ticketId: ticket.id,
      columnId: column.id,
      columnName: column.name,
      title: ticket.title,
      priority: ticket.priority,
      done: ticket.done,
      actionable,
      blockedBy,
      linkedToCurrentThread: linkedTicketIds.has(ticket.id),
    }
    const withDescription =
      ticket.description === undefined ? base : { ...base, description: ticket.description }
    return ticket.dueAt === undefined
      ? [withDescription]
      : [{ ...withDescription, dueAt: ticket.dueAt }]
  })

  const columns = snapshot.columns
    .toSorted((left, right) => (left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0))
    .map((column) => ({
      columnId: column.id,
      name: column.name,
      done: column.done,
      rank: column.rank,
    }))

  return {
    projectId: snapshot.projectId,
    snapshotSequence: snapshot.snapshotSequence,
    columns,
    tickets,
  }
})

const getTicket = Effect.fn("NoyauMcpTools.getTicket")(function* (input: {
  readonly ticketId: TicketId
}) {
  const invocation = yield* requireMcpCapability("board:read")
  const snapshot = yield* readBoardSnapshot(invocation.projectId).pipe(
    Effect.mapError(
      (error) =>
        new TicketListUnavailable({
          message: error.message,
        }),
    ),
  )
  const ticket = ticketViewFromSnapshot(snapshot, input.ticketId, invocation.threadId)
  if (ticket === undefined) {
    return yield* new TicketNotFoundInBoard({ ticketId: input.ticketId })
  }
  return {
    projectId: snapshot.projectId,
    snapshotSequence: snapshot.snapshotSequence,
    ticket,
  }
})

const createTicket = Effect.fn("NoyauMcpTools.createTicket")(function* (input: {
  readonly title: string
  readonly columnId: KanbanColumnId
  readonly operationId?: CommandId
  readonly beforeTicketId?: TicketId
  readonly afterTicketId?: TicketId
}) {
  const invocation = yield* requireMcpCapability("board:write")
  const commandId = yield* nextCommandId(input.operationId)
  const ticketId = yield* nextTicketId(input.operationId)
  const placement = ticketPlacement(input)
  return yield* dispatchTicketMutation(
    TicketCreateRequest.make({
      commandId,
      payload: {
        projectId: invocation.projectId,
        ticketId,
        title: input.title,
        placement,
      },
    }),
    ticketId,
  )
})

const updateTicket = Effect.fn("NoyauMcpTools.updateTicket")(function* (input: {
  readonly ticketId: TicketId
  readonly operationId?: CommandId
  readonly title?: string
  readonly description?: string | null
  readonly priority?: (typeof TicketPriority)["Type"]
  readonly dueAt?: Schema.Schema.Type<typeof Schema.DateTimeUtcFromString> | null
}) {
  const commandId = yield* nextCommandId(input.operationId)
  const payload: (typeof TicketUpdateRequest)["Type"]["payload"] = { ticketId: input.ticketId }
  if (input.title !== undefined) {
    Object.assign(payload, { title: input.title })
  }
  if (input.description !== undefined) {
    Object.assign(payload, { description: input.description })
  }
  if (input.priority !== undefined) {
    Object.assign(payload, { priority: input.priority })
  }
  if (input.dueAt !== undefined) {
    Object.assign(payload, { dueAt: input.dueAt })
  }
  return yield* dispatchTicketMutation(
    TicketUpdateRequest.make({ commandId, payload }),
    input.ticketId,
  )
})

const moveTicket = Effect.fn("NoyauMcpTools.moveTicket")(function* (input: {
  readonly ticketId: TicketId
  readonly columnId: KanbanColumnId
  readonly operationId?: CommandId
  readonly beforeTicketId?: TicketId
  readonly afterTicketId?: TicketId
  readonly acknowledgeOpenDependencies?: boolean
}) {
  const commandId = yield* nextCommandId(input.operationId)
  const placement = ticketPlacement(input)
  const payload =
    input.acknowledgeOpenDependencies === undefined
      ? { ticketId: input.ticketId, placement }
      : {
          ticketId: input.ticketId,
          placement,
          acknowledgeOpenDependencies: input.acknowledgeOpenDependencies,
        }
  return yield* dispatchTicketMutation(
    TicketMoveRequest.make({ commandId, payload }),
    input.ticketId,
  )
})

const completeTicket = Effect.fn("NoyauMcpTools.completeTicket")(function* (input: {
  readonly ticketId: TicketId
  readonly operationId?: CommandId
  readonly acknowledgeOpenDependencies?: boolean
}) {
  const commandId = yield* nextCommandId(input.operationId)
  const payload =
    input.acknowledgeOpenDependencies === undefined
      ? { ticketId: input.ticketId }
      : {
          ticketId: input.ticketId,
          acknowledgeOpenDependencies: input.acknowledgeOpenDependencies,
        }
  return yield* dispatchTicketMutation(
    TicketCompleteRequest.make({ commandId, payload }),
    input.ticketId,
  )
})

const reopenTicket = Effect.fn("NoyauMcpTools.reopenTicket")(function* (input: {
  readonly ticketId: TicketId
  readonly operationId?: CommandId
}) {
  const commandId = yield* nextCommandId(input.operationId)
  return yield* dispatchTicketMutation(
    TicketReopenRequest.make({ commandId, payload: { ticketId: input.ticketId } }),
    input.ticketId,
  )
})

const archiveTicket = Effect.fn("NoyauMcpTools.archiveTicket")(function* (input: {
  readonly ticketId: TicketId
  readonly operationId?: CommandId
  readonly acknowledgeOpenDependencies?: boolean
}) {
  const commandId = yield* nextCommandId(input.operationId)
  const payload =
    input.acknowledgeOpenDependencies === undefined
      ? { ticketId: input.ticketId }
      : {
          ticketId: input.ticketId,
          acknowledgeOpenDependencies: input.acknowledgeOpenDependencies,
        }
  return yield* dispatchTicketMutation(
    TicketArchiveRequest.make({ commandId, payload }),
    input.ticketId,
  )
})

const restoreTicket = Effect.fn("NoyauMcpTools.restoreTicket")(function* (input: {
  readonly ticketId: TicketId
  readonly operationId?: CommandId
}) {
  const commandId = yield* nextCommandId(input.operationId)
  return yield* dispatchTicketMutation(
    TicketRestoreRequest.make({ commandId, payload: { ticketId: input.ticketId } }),
    input.ticketId,
  )
})

const addDependency = Effect.fn("NoyauMcpTools.addDependency")(function* (input: {
  readonly ticketId: TicketId
  readonly dependsOnTicketId: TicketId
  readonly operationId?: CommandId
}) {
  const commandId = yield* nextCommandId(input.operationId)
  return yield* dispatchTicketMutation(
    TicketDependencyAddRequest.make({
      commandId,
      payload: { ticketId: input.ticketId, dependsOnTicketId: input.dependsOnTicketId },
    }),
    input.ticketId,
  )
})

const removeDependency = Effect.fn("NoyauMcpTools.removeDependency")(function* (input: {
  readonly ticketId: TicketId
  readonly dependsOnTicketId: TicketId
  readonly operationId?: CommandId
}) {
  const commandId = yield* nextCommandId(input.operationId)
  return yield* dispatchTicketMutation(
    TicketDependencyRemoveRequest.make({
      commandId,
      payload: { ticketId: input.ticketId, dependsOnTicketId: input.dependsOnTicketId },
    }),
    input.ticketId,
  )
})

const linkCurrentThread = Effect.fn("NoyauMcpTools.linkCurrentThread")(function* (input: {
  readonly ticketId: TicketId
  readonly operationId?: CommandId
}) {
  const invocation = yield* requireMcpCapability("board:write")
  const commandId = yield* nextCommandId(input.operationId)
  return yield* dispatchTicketMutation(
    TicketThreadLinkRequest.make({
      commandId,
      payload: { ticketId: input.ticketId, threadId: invocation.threadId },
    }),
    input.ticketId,
  )
})

const unlinkCurrentThread = Effect.fn("NoyauMcpTools.unlinkCurrentThread")(function* (input: {
  readonly ticketId: TicketId
  readonly operationId?: CommandId
}) {
  const invocation = yield* requireMcpCapability("board:write")
  const commandId = yield* nextCommandId(input.operationId)
  return yield* dispatchTicketMutation(
    TicketThreadUnlinkRequest.make({
      commandId,
      payload: { ticketId: input.ticketId, threadId: invocation.threadId },
    }),
    input.ticketId,
  )
})

const askQuestion = Effect.fn("NoyauMcpTools.askQuestion")(function* (input: {
  readonly title?: string
  readonly questions: ReadonlyArray<UserInputQuestion>
}) {
  const invocation = yield* requireMcpCapability("thread:ask")
  const userInputs = yield* TurnUserInputRegistry
  const crypto = yield* Crypto.Crypto
  const requestId = ApprovalRequestId.make(yield* crypto.randomUUIDv4.pipe(Effect.orDie))
  const prompt = input.questions[0]?.prompt
  let requestInput = {
    threadId: invocation.threadId,
    turnId: invocation.turnId,
    requestId,
    questions: [...input.questions],
  }
  if (input.title !== undefined) {
    requestInput = Object.assign(requestInput, { title: input.title })
  }
  if (prompt !== undefined) {
    requestInput = Object.assign(requestInput, { prompt })
  }
  const answers = yield* userInputs.request(requestInput)
  return { requestId, answers }
})

export const NoyauMcpToolkitHandlersLive = NoyauMcpToolkit.toLayer({
  noyau_ticket_list: listTickets,
  noyau_ticket_get: getTicket,
  noyau_ticket_create: createTicket,
  noyau_ticket_update: updateTicket,
  noyau_ticket_move: moveTicket,
  noyau_ticket_complete: completeTicket,
  noyau_ticket_reopen: reopenTicket,
  noyau_ticket_archive: archiveTicket,
  noyau_ticket_restore: restoreTicket,
  noyau_ticket_dependency_add: addDependency,
  noyau_ticket_dependency_remove: removeDependency,
  noyau_ticket_thread_link: linkCurrentThread,
  noyau_ticket_thread_unlink: unlinkCurrentThread,
  noyau_ask_question: askQuestion,
})
