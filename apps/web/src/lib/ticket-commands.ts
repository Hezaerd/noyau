import type { TicketPriority } from "@noyau/contracts/entities/ticket"
import {
  CommandId,
  KanbanColumnId,
  type ProjectId,
  type ThreadId,
  TicketId,
} from "@noyau/contracts/ids"
import {
  KanbanColumnCreateRequest,
  KanbanColumnDeleteRequest,
  KanbanColumnUpdateRequest,
  TicketArchiveRequest,
  TicketAssignRequest,
  TicketCreateRequest,
  TicketDependencyAddRequest,
  TicketDependencyRemoveRequest,
  TicketMoveRequest,
  TicketThreadLinkRequest,
  TicketThreadUnlinkRequest,
  TicketUpdateRequest,
  type TicketPlacement,
} from "@noyau/contracts/ticket/commands"
import { Crypto, Effect, Schema } from "effect"

const uuid = Effect.fnUntraced(function* () {
  const crypto = yield* Crypto.Crypto
  return yield* crypto.randomUUIDv4
})

export const makeTicketCreateRequest = Effect.fnUntraced(function* (input: {
  readonly projectId: ProjectId
  readonly title: string
  readonly placement: TicketPlacement
}) {
  const [commandId, ticketId] = yield* Effect.all([uuid(), uuid()])
  return TicketCreateRequest.make({
    commandId: CommandId.make(commandId),
    payload: {
      projectId: input.projectId,
      ticketId: TicketId.make(ticketId),
      title: input.title,
      placement: input.placement,
    },
  })
})

export const makeTicketMoveRequest = Effect.fnUntraced(function* (input: {
  readonly ticketId: TicketId
  readonly placement: TicketPlacement
}) {
  return TicketMoveRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeTicketAssignRequest = Effect.fnUntraced(function* (
  input: (typeof TicketAssignRequest)["Type"]["payload"],
) {
  return TicketAssignRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeTicketArchiveRequest = Effect.fnUntraced(function* (input: {
  readonly ticketId: TicketId
  readonly acknowledgeOpenDependencies?: boolean
}) {
  return TicketArchiveRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload:
      input.acknowledgeOpenDependencies === undefined
        ? { ticketId: input.ticketId }
        : {
            ticketId: input.ticketId,
            acknowledgeOpenDependencies: input.acknowledgeOpenDependencies,
          },
  })
})

export const makeTicketUpdateRequest = Effect.fnUntraced(function* (input: {
  readonly ticketId: TicketId
  readonly title?: string
  readonly description?: string | null
  readonly priority?: TicketPriority
  readonly dueAt?: string | null
}) {
  const { dueAt, ...details } = input
  const decodedDueAt =
    dueAt === undefined || dueAt === null
      ? dueAt
      : yield* Schema.decodeEffect(Schema.DateTimeUtcFromString)(dueAt)
  const payload = decodedDueAt === undefined ? details : { ...details, dueAt: decodedDueAt }
  return TicketUpdateRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload,
  })
})

export const makeTicketDependencyAddRequest = Effect.fnUntraced(function* (
  input: (typeof TicketDependencyAddRequest)["Type"]["payload"],
) {
  return TicketDependencyAddRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeTicketDependencyRemoveRequest = Effect.fnUntraced(function* (
  input: (typeof TicketDependencyRemoveRequest)["Type"]["payload"],
) {
  return TicketDependencyRemoveRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeTicketThreadLinkRequest = Effect.fnUntraced(function* (input: {
  readonly ticketId: TicketId
  readonly threadId: ThreadId
}) {
  return TicketThreadLinkRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeTicketThreadUnlinkRequest = Effect.fnUntraced(function* (input: {
  readonly ticketId: TicketId
  readonly threadId: ThreadId
}) {
  return TicketThreadUnlinkRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeKanbanColumnCreateRequest = Effect.fnUntraced(function* (input: {
  readonly projectId: ProjectId
  readonly name: string
  readonly color: string
  readonly beforeColumnId?: KanbanColumnId
  readonly afterColumnId?: KanbanColumnId
}) {
  const [commandId, columnId] = yield* Effect.all([uuid(), uuid()])
  return KanbanColumnCreateRequest.make({
    commandId: CommandId.make(commandId),
    payload: {
      ...input,
      columnId: KanbanColumnId.make(columnId),
    },
  })
})

export const makeKanbanColumnUpdateRequest = Effect.fnUntraced(function* (
  input: (typeof KanbanColumnUpdateRequest)["Type"]["payload"],
) {
  return KanbanColumnUpdateRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeKanbanColumnDeleteRequest = Effect.fnUntraced(function* (
  input: (typeof KanbanColumnDeleteRequest)["Type"]["payload"],
) {
  return KanbanColumnDeleteRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})
