import {
  KanbanRank,
  type KanbanRank as KanbanRankType,
} from "@noyau/protocol/entities/kanban-column"
import type { KanbanColumnId, TicketId } from "@noyau/protocol/ids"
import type { TicketCommand } from "@noyau/protocol/ticket/commands"
import {
  ColumnDestinationRequired,
  DoneColumnCreationForbidden,
  DoneColumnDestinationForbidden,
  InvalidColumnPlacement,
  InvalidTicketPlacement,
  KanbanColumnAlreadyExists,
  KanbanColumnNotFound,
  OpenDependenciesConfirmationRequired,
  ProtectedDoneColumn,
  TicketAlreadyArchived,
  TicketAlreadyCompleted,
  TicketDependencyAlreadyExists,
  TicketDependencyCycle,
  TicketDependencyNotFound,
  TicketSelfDependency,
  TicketAlreadyExists,
  TicketNotArchived,
  TicketNotCompleted,
  TicketNotFound,
  TicketThreadAlreadyLinked,
  TicketThreadNotLinked,
  TicketThreadProjectMismatch,
} from "@noyau/protocol/ticket/errors"
import {
  BoardInitialized,
  KanbanColumnCreated,
  KanbanColumnDeleted,
  KanbanColumnMoved,
  KanbanColumnUpdated,
  TicketArchived,
  TicketAssigned,
  TicketCompleted,
  TicketCreated,
  TicketDependencyAdded,
  TicketDependencyRemoved,
  type TicketEvent,
  TicketMoved,
  TicketReopened,
  TicketRestored,
  TicketThreadLinked,
  TicketThreadUnlinked,
  TicketUpdated,
} from "@noyau/protocol/ticket/events"
import { Result, Schema } from "effect"
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing"

import type { BoardState, ColumnState, TicketState } from "./projector"

export type BoardDecisionError =
  | ColumnDestinationRequired
  | DoneColumnCreationForbidden
  | DoneColumnDestinationForbidden
  | InvalidColumnPlacement
  | InvalidTicketPlacement
  | KanbanColumnAlreadyExists
  | KanbanColumnNotFound
  | OpenDependenciesConfirmationRequired
  | ProtectedDoneColumn
  | TicketAlreadyArchived
  | TicketAlreadyCompleted
  | TicketDependencyAlreadyExists
  | TicketDependencyCycle
  | TicketDependencyNotFound
  | TicketSelfDependency
  | TicketAlreadyExists
  | TicketNotArchived
  | TicketNotCompleted
  | TicketNotFound
  | TicketThreadAlreadyLinked
  | TicketThreadNotLinked
  | TicketThreadProjectMismatch

const rank = (value: string) => Schema.decodeSync(KanbanRank)(value)

const compareRanks = (left: { readonly rank: string }, right: { readonly rank: string }) =>
  left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0

const orderedColumns = (state: BoardState) => state.columns.toSorted(compareRanks)

const orderedTickets = (state: BoardState, columnId: KanbanColumnId, excludedTicketId?: TicketId) =>
  state.tickets
    .filter(
      (ticket) =>
        ticket.columnId === columnId && !ticket.archived && ticket.ticketId !== excludedTicketId,
    )
    .toSorted(compareRanks)

const findColumn = (state: BoardState, columnId: KanbanColumnId) =>
  state.columns.find((column) => column.columnId === columnId)

const findTicket = (state: BoardState, ticketId: TicketId) =>
  state.tickets.find((ticket) => ticket.ticketId === ticketId)

const doneColumn = (state: BoardState) => state.columns.find((column) => column.done)

interface Anchors<T> {
  readonly before?: T
  readonly after?: T
}

const validateTicketAnchors = (
  state: BoardState,
  columnId: KanbanColumnId,
  beforeTicketId: TicketId | undefined,
  afterTicketId: TicketId | undefined,
  excludedTicketId?: TicketId,
): Result.Result<Anchors<TicketState>, BoardDecisionError> => {
  if (findColumn(state, columnId) === undefined) {
    return Result.fail(new KanbanColumnNotFound({ columnId }))
  }
  const tickets = orderedTickets(state, columnId, excludedTicketId)
  const before = tickets.find((ticket) => ticket.ticketId === beforeTicketId)
  const after = tickets.find((ticket) => ticket.ticketId === afterTicketId)
  const invalid =
    (excludedTicketId !== undefined && beforeTicketId === excludedTicketId) ||
    (excludedTicketId !== undefined && afterTicketId === excludedTicketId) ||
    (beforeTicketId !== undefined && before === undefined) ||
    (afterTicketId !== undefined && after === undefined) ||
    (before !== undefined &&
      after !== undefined &&
      tickets.indexOf(after) + 1 !== tickets.indexOf(before))

  if (invalid) {
    const placement = { columnId }
    if (beforeTicketId !== undefined) {
      Object.assign(placement, { beforeTicketId })
    }
    if (afterTicketId !== undefined) {
      Object.assign(placement, { afterTicketId })
    }
    return Result.fail(new InvalidTicketPlacement(placement))
  }

  const anchors = {}
  if (before !== undefined) {
    Object.assign(anchors, { before })
  }
  if (after !== undefined) {
    Object.assign(anchors, { after })
  }
  return Result.succeed(anchors)
}

const ticketRank = (
  state: BoardState,
  columnId: KanbanColumnId,
  beforeTicketId: TicketId | undefined,
  afterTicketId: TicketId | undefined,
  excludedTicketId?: TicketId,
): Result.Result<KanbanRankType, BoardDecisionError> =>
  validateTicketAnchors(state, columnId, beforeTicketId, afterTicketId, excludedTicketId).pipe(
    Result.map(({ before, after }) => {
      const tickets = orderedTickets(state, columnId, excludedTicketId)
      if (before !== undefined && after === undefined) {
        const beforeIndex = tickets.indexOf(before)
        return rank(generateKeyBetween(tickets[beforeIndex - 1]?.rank ?? null, before.rank))
      }
      if (after !== undefined && before === undefined) {
        const afterIndex = tickets.indexOf(after)
        return rank(generateKeyBetween(after.rank, tickets[afterIndex + 1]?.rank ?? null))
      }
      return rank(
        generateKeyBetween(
          after?.rank ?? (before === undefined ? (tickets.at(-1)?.rank ?? null) : null),
          before?.rank ?? null,
        ),
      )
    }),
  )

const validateColumnAnchors = (
  state: BoardState,
  beforeColumnId: KanbanColumnId | undefined,
  afterColumnId: KanbanColumnId | undefined,
  excludedColumnId?: KanbanColumnId,
): Result.Result<Anchors<ColumnState>, BoardDecisionError> => {
  const columns = orderedColumns(state).filter((column) => column.columnId !== excludedColumnId)
  const before = columns.find((column) => column.columnId === beforeColumnId)
  const after = columns.find((column) => column.columnId === afterColumnId)
  const invalid =
    (excludedColumnId !== undefined && beforeColumnId === excludedColumnId) ||
    (excludedColumnId !== undefined && afterColumnId === excludedColumnId) ||
    (beforeColumnId !== undefined && before === undefined) ||
    (afterColumnId !== undefined && after === undefined) ||
    (before !== undefined &&
      after !== undefined &&
      columns.indexOf(after) + 1 !== columns.indexOf(before))

  if (invalid) {
    const placement = {}
    if (beforeColumnId !== undefined) {
      Object.assign(placement, { beforeColumnId })
    }
    if (afterColumnId !== undefined) {
      Object.assign(placement, { afterColumnId })
    }
    return Result.fail(new InvalidColumnPlacement(placement))
  }

  const anchors = {}
  if (before !== undefined) {
    Object.assign(anchors, { before })
  }
  if (after !== undefined) {
    Object.assign(anchors, { after })
  }
  return Result.succeed(anchors)
}

const columnRank = (
  state: BoardState,
  beforeColumnId: KanbanColumnId | undefined,
  afterColumnId: KanbanColumnId | undefined,
  excludedColumnId?: KanbanColumnId,
) =>
  validateColumnAnchors(state, beforeColumnId, afterColumnId, excludedColumnId).pipe(
    Result.map(({ before, after }) => {
      const columns = orderedColumns(state).filter((column) => column.columnId !== excludedColumnId)
      if (before !== undefined && after === undefined) {
        const beforeIndex = columns.indexOf(before)
        return rank(generateKeyBetween(columns[beforeIndex - 1]?.rank ?? null, before.rank))
      }
      if (after !== undefined && before === undefined) {
        const afterIndex = columns.indexOf(after)
        return rank(generateKeyBetween(after.rank, columns[afterIndex + 1]?.rank ?? null))
      }
      return rank(
        generateKeyBetween(
          after?.rank ?? (before === undefined ? (columns.at(-1)?.rank ?? null) : null),
          before?.rank ?? null,
        ),
      )
    }),
  )

const requireTicket = (
  state: BoardState,
  ticketId: TicketId,
): Result.Result<TicketState, TicketNotFound> => {
  const ticket = findTicket(state, ticketId)
  return ticket === undefined
    ? Result.fail(new TicketNotFound({ ticketId }))
    : Result.succeed(ticket)
}

const requireCloseConfirmation = (
  ticket: TicketState,
  acknowledgeOpenDependencies: boolean | undefined,
): Result.Result<void, BoardDecisionError> => {
  if (ticket.openDependencyIds.length > 0 && acknowledgeOpenDependencies !== true) {
    return Result.fail(
      new OpenDependenciesConfirmationRequired({
        ticketId: ticket.ticketId,
      }),
    )
  }
  return Result.succeed(undefined)
}

const hasDependencyPath = (
  state: BoardState,
  fromTicketId: TicketId,
  targetTicketId: TicketId,
): boolean => {
  const visited = new Set<TicketId>()
  const pending = [fromTicketId]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === undefined) {
      continue
    }
    if (current === targetTicketId) {
      return true
    }
    if (visited.has(current)) {
      continue
    }
    visited.add(current)
    for (const dependency of state.dependencies) {
      if (dependency.ticketId === current) {
        pending.push(dependency.dependsOnTicketId)
      }
    }
  }
  return false
}

const initialize = (
  state: BoardState,
  command: Extract<TicketCommand, { _tag: "board.initialize" }>,
) => {
  if (state.columns.length > 0) {
    return Result.fail(
      new KanbanColumnAlreadyExists({
        columnId: state.columns[0]?.columnId ?? command.payload.backlogColumnId,
      }),
    )
  }
  const [backlogRank, activeRank, doneRank] = generateNKeysBetween(null, null, 3).map(rank)
  if (backlogRank === undefined || activeRank === undefined || doneRank === undefined) {
    throw new Error("fractional-indexing returned fewer keys than requested")
  }
  return Result.succeed([
    BoardInitialized.make({
      backlogColumnId: command.payload.backlogColumnId,
      activeColumnId: command.payload.activeColumnId,
      doneColumnId: command.payload.doneColumnId,
    }),
    KanbanColumnCreated.make({
      columnId: command.payload.backlogColumnId,
      name: "Backlog",
      color: "#6D5BD0",
      rank: backlogRank,
      done: false,
    }),
    KanbanColumnCreated.make({
      columnId: command.payload.activeColumnId,
      name: "En cours",
      color: "#3B82F6",
      rank: activeRank,
      done: false,
    }),
    KanbanColumnCreated.make({
      columnId: command.payload.doneColumnId,
      name: "Done",
      color: "#10B981",
      rank: doneRank,
      done: true,
    }),
  ])
}

/**
 * Decider pur du Tableau. Il ne génère ni UUID ni horloge ; les identités
 * techniques nécessaires sont portées par la commande enrichie.
 */
export const decide = (
  state: BoardState,
  command: TicketCommand,
): Result.Result<ReadonlyArray<TicketEvent>, BoardDecisionError> => {
  switch (command._tag) {
    case "board.initialize":
      return initialize(state, command)
    case "kanbanColumn.create": {
      if (findColumn(state, command.payload.columnId) !== undefined) {
        return Result.fail(new KanbanColumnAlreadyExists({ columnId: command.payload.columnId }))
      }
      return columnRank(state, command.payload.beforeColumnId, command.payload.afterColumnId).pipe(
        Result.map((newRank) => [
          KanbanColumnCreated.make({
            columnId: command.payload.columnId,
            name: command.payload.name,
            color: command.payload.color,
            rank: newRank,
            done: false,
          }),
        ]),
      )
    }
    case "kanbanColumn.update": {
      const column = findColumn(state, command.payload.columnId)
      return column === undefined
        ? Result.fail(new KanbanColumnNotFound({ columnId: command.payload.columnId }))
        : Result.succeed([KanbanColumnUpdated.make(command.payload)])
    }
    case "kanbanColumn.move": {
      const column = findColumn(state, command.payload.columnId)
      if (column === undefined) {
        return Result.fail(new KanbanColumnNotFound({ columnId: command.payload.columnId }))
      }
      return columnRank(
        state,
        command.payload.beforeColumnId,
        command.payload.afterColumnId,
        column.columnId,
      ).pipe(
        Result.map((newRank) => [
          KanbanColumnMoved.make({ columnId: column.columnId, rank: newRank }),
        ]),
      )
    }
    case "kanbanColumn.delete": {
      const column = findColumn(state, command.payload.columnId)
      if (column === undefined) {
        return Result.fail(new KanbanColumnNotFound({ columnId: command.payload.columnId }))
      }
      if (column.done) {
        return Result.fail(new ProtectedDoneColumn({ columnId: column.columnId }))
      }
      const tickets = orderedTickets(state, column.columnId)
      const hasReferences = state.tickets.some(
        (ticket) =>
          (!ticket.archived && ticket.columnId === column.columnId) ||
          (ticket.archived && ticket.columnId === column.columnId) ||
          (ticket.done && ticket.lastActiveColumnId === column.columnId),
      )
      if (hasReferences && command.payload.destinationColumnId === undefined) {
        return Result.fail(new ColumnDestinationRequired({ columnId: column.columnId }))
      }
      const destinationId = command.payload.destinationColumnId
      if (destinationId === column.columnId) {
        return Result.fail(
          new InvalidColumnPlacement({
            beforeColumnId: column.columnId,
            afterColumnId: column.columnId,
          }),
        )
      }
      const destination = destinationId === undefined ? undefined : findColumn(state, destinationId)
      if (destinationId !== undefined && destination === undefined) {
        return Result.fail(new KanbanColumnNotFound({ columnId: destinationId }))
      }
      if (destination?.done === true) {
        return Result.fail(
          new DoneColumnDestinationForbidden({ destinationColumnId: destination.columnId }),
        )
      }
      const destinationTickets =
        destinationId === undefined ? [] : orderedTickets(state, destinationId)
      const generatedRanks = generateNKeysBetween(
        destinationTickets.at(-1)?.rank ?? null,
        null,
        tickets.length,
      ).map(rank)
      const deletedColumn = { columnId: column.columnId }
      if (destinationId !== undefined) {
        Object.assign(deletedColumn, { destinationColumnId: destinationId })
      }
      return Result.succeed([
        ...tickets.map((ticket, index) => {
          const newRank = generatedRanks[index] ?? rank(ticket.rank)
          return TicketMoved.make({
            ticketId: ticket.ticketId,
            columnId: destinationId ?? column.columnId,
            rank: newRank,
          })
        }),
        KanbanColumnDeleted.make(deletedColumn),
      ])
    }
    case "ticket.create": {
      if (findTicket(state, command.payload.ticketId) !== undefined) {
        return Result.fail(new TicketAlreadyExists({ ticketId: command.payload.ticketId }))
      }
      const target = findColumn(state, command.payload.placement.columnId)
      if (target?.done === true) {
        return Result.fail(new DoneColumnCreationForbidden({ columnId: target.columnId }))
      }
      return ticketRank(
        state,
        command.payload.placement.columnId,
        command.payload.placement.beforeTicketId,
        command.payload.placement.afterTicketId,
      ).pipe(
        Result.map((newRank) => [
          TicketCreated.make({
            ticketId: command.payload.ticketId,
            columnId: command.payload.placement.columnId,
            rank: newRank,
            title: command.payload.title,
          }),
        ]),
      )
    }
    case "ticket.move":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.flatMap((ticket): Result.Result<ReadonlyArray<TicketEvent>, BoardDecisionError> => {
          if (ticket.archived) {
            return Result.fail(new TicketAlreadyArchived({ ticketId: ticket.ticketId }))
          }
          const target = findColumn(state, command.payload.placement.columnId)
          const confirmation =
            target?.done === true && !ticket.done
              ? requireCloseConfirmation(ticket, command.payload.acknowledgeOpenDependencies)
              : Result.succeed(undefined)
          return confirmation.pipe(
            Result.flatMap(() =>
              ticketRank(
                state,
                command.payload.placement.columnId,
                command.payload.placement.beforeTicketId,
                command.payload.placement.afterTicketId,
                ticket.ticketId,
              ),
            ),
            Result.map((newRank) => {
              if (target?.done === true && !ticket.done) {
                return [
                  TicketCompleted.make({
                    ticketId: ticket.ticketId,
                    previousColumnId: ticket.columnId,
                    doneColumnId: target.columnId,
                    rank: newRank,
                  }),
                ]
              }
              if (target?.done !== true && ticket.done) {
                return [
                  TicketReopened.make({
                    ticketId: ticket.ticketId,
                    columnId: target?.columnId ?? command.payload.placement.columnId,
                    rank: newRank,
                  }),
                ]
              }
              return [
                TicketMoved.make({
                  ticketId: ticket.ticketId,
                  columnId: command.payload.placement.columnId,
                  rank: newRank,
                }),
              ]
            }),
          )
        }),
      )
    case "ticket.complete":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.flatMap((ticket) => {
          if (ticket.done) {
            return Result.fail(new TicketAlreadyCompleted({ ticketId: ticket.ticketId }))
          }
          if (ticket.archived) {
            return Result.fail(new TicketAlreadyArchived({ ticketId: ticket.ticketId }))
          }
          const done = doneColumn(state)
          if (done === undefined) {
            return Result.fail(new KanbanColumnNotFound({ columnId: ticket.columnId }))
          }
          return requireCloseConfirmation(ticket, command.payload.acknowledgeOpenDependencies).pipe(
            Result.flatMap(() => ticketRank(state, done.columnId, undefined, undefined)),
            Result.map((newRank) => [
              TicketCompleted.make({
                ticketId: ticket.ticketId,
                previousColumnId: ticket.columnId,
                doneColumnId: done.columnId,
                rank: newRank,
              }),
            ]),
          )
        }),
      )
    case "ticket.reopen":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.flatMap((ticket) => {
          if (ticket.archived) {
            return Result.fail(new TicketAlreadyArchived({ ticketId: ticket.ticketId }))
          }
          if (!ticket.done) {
            return Result.fail(new TicketNotCompleted({ ticketId: ticket.ticketId }))
          }
          const columnId = ticket.lastActiveColumnId
          if (columnId === undefined || findColumn(state, columnId) === undefined) {
            return Result.fail(new KanbanColumnNotFound({ columnId: ticket.columnId }))
          }
          return ticketRank(state, columnId, undefined, undefined, ticket.ticketId).pipe(
            Result.map((newRank) => [
              TicketReopened.make({ ticketId: ticket.ticketId, columnId, rank: newRank }),
            ]),
          )
        }),
      )
    case "ticket.archive":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.flatMap((ticket) =>
          ticket.archived
            ? Result.fail(new TicketAlreadyArchived({ ticketId: ticket.ticketId }))
            : requireCloseConfirmation(ticket, command.payload.acknowledgeOpenDependencies).pipe(
                Result.map(() => [TicketArchived.make({ ticketId: ticket.ticketId })]),
              ),
        ),
      )
    case "ticket.restore":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.flatMap((ticket) => {
          if (!ticket.archived) {
            return Result.fail(new TicketNotArchived({ ticketId: ticket.ticketId }))
          }
          const currentDoneColumn = ticket.done ? doneColumn(state) : undefined
          if (ticket.done && currentDoneColumn === undefined) {
            return Result.fail(new KanbanColumnNotFound({ columnId: ticket.columnId }))
          }
          const columnId = currentDoneColumn?.columnId ?? ticket.columnId
          return ticketRank(state, columnId, undefined, undefined, ticket.ticketId).pipe(
            Result.map((newRank) => [
              TicketRestored.make({ ticketId: ticket.ticketId, columnId, rank: newRank }),
            ]),
          )
        }),
      )
    case "ticket.assign":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.map((ticket) => {
          const assigned = { ticketId: ticket.ticketId }
          if (command.payload.assigneeId !== undefined) {
            Object.assign(assigned, { assigneeId: command.payload.assigneeId })
          }
          return [TicketAssigned.make(assigned)]
        }),
      )
    case "ticket.update":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.map(() => [TicketUpdated.make(command.payload)]),
      )
    case "ticket.dependency.add":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.flatMap(() => requireTicket(state, command.payload.dependsOnTicketId)),
        Result.flatMap((): Result.Result<ReadonlyArray<TicketEvent>, BoardDecisionError> => {
          const { ticketId, dependsOnTicketId } = command.payload
          if (ticketId === dependsOnTicketId) {
            return Result.fail(new TicketSelfDependency({ ticketId }))
          }
          if (
            state.dependencies.some(
              (dependency) =>
                dependency.ticketId === ticketId &&
                dependency.dependsOnTicketId === dependsOnTicketId,
            )
          ) {
            return Result.fail(new TicketDependencyAlreadyExists({ ticketId, dependsOnTicketId }))
          }
          if (hasDependencyPath(state, dependsOnTicketId, ticketId)) {
            return Result.fail(new TicketDependencyCycle({ ticketId, dependsOnTicketId }))
          }
          return Result.succeed([TicketDependencyAdded.make({ ticketId, dependsOnTicketId })])
        }),
      )
    case "ticket.dependency.remove": {
      const { ticketId, dependsOnTicketId } = command.payload
      const exists = state.dependencies.some(
        (dependency) =>
          dependency.ticketId === ticketId && dependency.dependsOnTicketId === dependsOnTicketId,
      )
      return exists
        ? Result.succeed([TicketDependencyRemoved.make({ ticketId, dependsOnTicketId })])
        : Result.fail(new TicketDependencyNotFound({ ticketId, dependsOnTicketId }))
    }
    case "ticket.thread.link":
      return requireTicket(state, command.payload.ticketId).pipe(
        Result.flatMap((): Result.Result<ReadonlyArray<TicketEvent>, BoardDecisionError> => {
          const { ticketId, threadId } = command.payload
          if (!state.projectThreadIds.includes(threadId)) {
            return Result.fail(new TicketThreadProjectMismatch({ ticketId, threadId }))
          }
          if (
            state.ticketThreads.some(
              (link) => link.ticketId === ticketId && link.threadId === threadId,
            )
          ) {
            return Result.fail(new TicketThreadAlreadyLinked({ ticketId, threadId }))
          }
          return Result.succeed([TicketThreadLinked.make({ ticketId, threadId })])
        }),
      )
    case "ticket.thread.unlink": {
      const { ticketId, threadId } = command.payload
      const exists = state.ticketThreads.some(
        (link) => link.ticketId === ticketId && link.threadId === threadId,
      )
      return exists
        ? Result.succeed([TicketThreadUnlinked.make({ ticketId, threadId })])
        : Result.fail(new TicketThreadNotLinked({ ticketId, threadId }))
    }
  }
}
