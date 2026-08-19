import type { TicketPriority } from "@noyau/protocol/entities/ticket"
import { CommandId, KanbanColumnId, TicketId } from "@noyau/protocol/ids"
import {
  KanbanColumnCreateRequest,
  KanbanColumnDeleteRequest,
  KanbanColumnUpdateRequest,
  TicketAssignRequest,
  TicketCreateRequest,
  TicketDependencyAddRequest,
  TicketDependencyRemoveRequest,
  TicketMoveRequest,
  TicketUpdateRequest,
  type TicketPlacement,
} from "@noyau/protocol/ticket/commands"
import { Crypto, Effect, Schema } from "effect"

const uuid = Effect.fn("TicketCommands.uuid")(function* () {
  const crypto = yield* Crypto.Crypto
  return yield* crypto.randomUUIDv4
})

export const makeTicketCreateRequest = Effect.fn("TicketCommands.ticketCreate")(function* (input: {
  readonly title: string
  readonly placement: TicketPlacement
}) {
  const [commandId, ticketId] = yield* Effect.all([uuid(), uuid()])
  return TicketCreateRequest.make({
    commandId: CommandId.make(commandId),
    payload: {
      ticketId: TicketId.make(ticketId),
      title: input.title,
      placement: input.placement,
    },
  })
})

export const makeTicketMoveRequest = Effect.fn("TicketCommands.ticketMove")(function* (input: {
  readonly ticketId: TicketId
  readonly placement: TicketPlacement
}) {
  return TicketMoveRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeTicketAssignRequest = Effect.fn("TicketCommands.ticketAssign")(function* (
  input: (typeof TicketAssignRequest)["Type"]["payload"],
) {
  return TicketAssignRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: input,
  })
})

export const makeTicketUpdateRequest = Effect.fn("TicketCommands.ticketUpdate")(function* (input: {
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

export const makeTicketDependencyAddRequest = Effect.fn("TicketCommands.ticketDependencyAdd")(
  function* (input: (typeof TicketDependencyAddRequest)["Type"]["payload"]) {
    return TicketDependencyAddRequest.make({
      commandId: CommandId.make(yield* uuid()),
      payload: input,
    })
  },
)

export const makeTicketDependencyRemoveRequest = Effect.fn("TicketCommands.ticketDependencyRemove")(
  function* (input: (typeof TicketDependencyRemoveRequest)["Type"]["payload"]) {
    return TicketDependencyRemoveRequest.make({
      commandId: CommandId.make(yield* uuid()),
      payload: input,
    })
  },
)

export const makeKanbanColumnCreateRequest = Effect.fn("TicketCommands.kanbanColumnCreate")(
  function* (input: {
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
  },
)

export const makeKanbanColumnUpdateRequest = Effect.fn("TicketCommands.kanbanColumnUpdate")(
  function* (input: (typeof KanbanColumnUpdateRequest)["Type"]["payload"]) {
    return KanbanColumnUpdateRequest.make({
      commandId: CommandId.make(yield* uuid()),
      payload: input,
    })
  },
)

export const makeKanbanColumnDeleteRequest = Effect.fn("TicketCommands.kanbanColumnDelete")(
  function* (input: (typeof KanbanColumnDeleteRequest)["Type"]["payload"]) {
    return KanbanColumnDeleteRequest.make({
      commandId: CommandId.make(yield* uuid()),
      payload: input,
    })
  },
)
