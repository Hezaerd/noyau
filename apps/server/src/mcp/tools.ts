import { TicketPriority } from "@noyau/protocol/entities/ticket"
import { KanbanColumnId, ProjectId, Sequence, TicketId } from "@noyau/protocol/ids"
import type { ProjectStreamItem } from "@noyau/protocol/rpc"
import { ControlPlane } from "@noyau/server/control-plane"
import { Effect, Option, Schema, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"

import {
  McpCapabilityMissing,
  McpInvocationContext,
  requireMcpCapability,
} from "./mcp-invocation-context.ts"

const TicketListState = Schema.Literals(["open", "done", "all"] as const)
const TicketActionability = Schema.Literals(["actionable", "blocked", "all"] as const)

const TicketDependencyView = Schema.Struct({
  ticketId: TicketId,
  title: Schema.NonEmptyString,
  done: Schema.Boolean,
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
  tickets: Schema.Array(TicketListItem),
})

export class TicketListUnavailable extends Schema.TaggedError<TicketListUnavailable>()(
  "TicketListUnavailable",
  { message: Schema.NonEmptyString },
) {}

export const NoyauTicketListTool = Tool.make("noyau_ticket_list", {
  description:
    "List active Noyau tickets in this agent's project. Defaults to open tickets; filter by actionability to find work whose dependencies are complete or blocked.",
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

export const NoyauMcpToolkit = Toolkit.make(NoyauTicketListTool)

const listTickets = Effect.fn("NoyauMcpTools.listTickets")(function* (input: {
  readonly state?: "open" | "done" | "all"
  readonly actionability?: "actionable" | "blocked" | "all"
}) {
  const invocation = yield* requireMcpCapability("board:read")
  const controlPlane = yield* ControlPlane
  const frame = yield* controlPlane.subscribeProject({ projectId: invocation.projectId }).pipe(
    Stream.filter(
      (item): item is Extract<ProjectStreamItem, { readonly kind: "snapshot" }> =>
        item.kind === "snapshot",
    ),
    Stream.runHead,
    Effect.mapError(
      () => new TicketListUnavailable({ message: "The Noyau board is unavailable." }),
    ),
  )
  if (Option.isNone(frame)) {
    return yield* new TicketListUnavailable({
      message: "The Noyau board stream ended before returning a snapshot.",
    })
  }

  const snapshot = frame.value.snapshot
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

  return {
    projectId: snapshot.projectId,
    snapshotSequence: snapshot.snapshotSequence,
    tickets,
  }
})

export const NoyauMcpToolkitHandlersLive = NoyauMcpToolkit.toLayer({
  noyau_ticket_list: listTickets,
})
