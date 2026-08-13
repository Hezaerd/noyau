import { describe, expect, it } from "@effect/vitest"
import { decide } from "@noyau/domain/board/decider"
import { emptyBoardState, evolve, type BoardState } from "@noyau/domain/board/projector"
import { ExecutionId, TicketId } from "@noyau/protocol/ids"
import { TicketCommand } from "@noyau/protocol/ticket/commands"
import type { TicketEvent } from "@noyau/protocol/ticket/events"
import { Result, Schema } from "effect"

const ids = {
  project: "3f8f0d70-1111-4000-8000-000000000001",
  backlog: "3f8f0d70-1111-4000-8000-000000000002",
  active: "3f8f0d70-1111-4000-8000-000000000003",
  done: "3f8f0d70-1111-4000-8000-000000000004",
  ticket: "3f8f0d70-1111-4000-8000-000000000005",
  ticket2: "3f8f0d70-1111-4000-8000-000000000006",
  thread: "3f8f0d70-1111-4000-8000-000000000007",
  execution: "3f8f0d70-1111-4000-8000-000000000008",
  profile: "3f8f0d70-1111-4000-8000-000000000009",
  command: "3f8f0d70-1111-4000-8000-000000000010",
  correlation: "3f8f0d70-1111-4000-8000-000000000011",
  missing: "3f8f0d70-1111-4000-8000-000000000012",
} as const

const meta = {
  commandId: ids.command,
  projectId: ids.project,
  actorId: "human:hezaerd",
  correlationId: ids.correlation,
  issuedAt: "2026-08-13T12:00:00.000Z",
  schemaVersion: 1,
} as const

const command = (input: unknown) => Schema.decodeUnknownSync(TicketCommand)(input)
const executionId = Schema.decodeSync(ExecutionId)(ids.execution)
const ticket2Id = Schema.decodeSync(TicketId)(ids.ticket2)

const success = <A, E>(result: Result.Result<A, E>): A => {
  expect(Result.isSuccess(result)).toBe(true)
  if (!Result.isSuccess(result)) {
    throw new Error(`Expected success, received ${String(result.failure)}`)
  }
  return result.success
}

const failure = <A, E>(result: Result.Result<A, E>): E => {
  expect(Result.isFailure(result)).toBe(true)
  if (!Result.isFailure(result)) {
    throw new Error("Expected failure")
  }
  return result.failure
}

const apply = (state: BoardState, events: ReadonlyArray<TicketEvent>) =>
  events.reduce(evolve, state)

const initialized = () =>
  apply(
    emptyBoardState,
    success(
      decide(
        emptyBoardState,
        command({
          _tag: "board.initialize",
          ...meta,
          payload: {
            backlogColumnId: ids.backlog,
            activeColumnId: ids.active,
            doneColumnId: ids.done,
          },
        }),
      ),
    ),
  )

const createTicket = (state: BoardState, ticketId: string = ids.ticket) =>
  success(
    decide(
      state,
      command({
        _tag: "ticket.create",
        ...meta,
        payload: {
          ticketId,
          workbenchThreadId: ids.thread,
          title: `Ticket ${ticketId}`,
          placement: { columnId: ids.backlog },
        },
      }),
    ),
  )

const stateWithTicket = () => {
  const board = initialized()
  return apply(board, createTicket(board))
}

describe("board.initialize", () => {
  it("crée exactement les trois colonnes par défaut et protège Done par son identité", () => {
    const board = initialized()

    expect(board.columns).toHaveLength(3)
    expect(board.columns.map((column) => column.rank)).toEqual(["a0", "a1", "a2"])
    expect(board.columns.filter((column) => column.done).map((column) => column.columnId)).toEqual([
      ids.done,
    ])
  })

  it("refuse de réinitialiser un Tableau existant", () => {
    const board = initialized()
    const error = failure(
      decide(
        board,
        command({
          _tag: "board.initialize",
          ...meta,
          payload: {
            backlogColumnId: ids.backlog,
            activeColumnId: ids.active,
            doneColumnId: ids.done,
          },
        }),
      ),
    )

    expect(error._tag).toBe("KanbanColumnAlreadyExists")
  })
})

describe("ticket placement", () => {
  it("calcule les ranks côté domaine et conserve leur ordre", () => {
    const board = initialized()
    const first = apply(board, createTicket(board))
    const second = apply(first, createTicket(first, ids.ticket2))

    expect(second.tickets.map((ticket) => ticket.rank)).toEqual(["a0", "a1"])
  })

  it("rejette des ancres devenues incohérentes", () => {
    const state = stateWithTicket()
    const error = failure(
      decide(
        state,
        command({
          _tag: "ticket.move",
          ...meta,
          payload: {
            ticketId: ids.ticket,
            placement: {
              columnId: ids.active,
              beforeTicketId: ids.missing,
            },
          },
        }),
      ),
    )

    expect(error._tag).toBe("InvalidTicketPlacement")
  })

  it("laisse déplacer un Ticket bloqué entre colonnes ordinaires", () => {
    const state = stateWithTicket()
    const ticket = state.tickets[0]
    if (ticket === undefined) {
      throw new Error("Missing fixture ticket")
    }
    const blocked: BoardState = {
      ...state,
      tickets: [{ ...ticket, openDependencyIds: [ticket2Id] }],
    }
    const moved = success(
      decide(
        blocked,
        command({
          _tag: "ticket.move",
          ...meta,
          payload: {
            ticketId: ids.ticket,
            placement: { columnId: ids.active },
          },
        }),
      ),
    )

    expect(moved[0]?._tag).toBe("ticket.moved")
  })
})

describe("Done coherence", () => {
  it("transforme un déplacement vers Done en clôture et mémorise la colonne active", () => {
    const state = stateWithTicket()
    const completed = success(
      decide(
        state,
        command({
          _tag: "ticket.move",
          ...meta,
          payload: {
            ticketId: ids.ticket,
            placement: { columnId: ids.done },
          },
        }),
      ),
    )
    const next = apply(state, completed)

    expect(completed[0]?._tag).toBe("ticket.completed")
    expect(next.tickets[0]).toMatchObject({
      done: true,
      columnId: ids.done,
      lastActiveColumnId: ids.backlog,
    })
  })

  it("restaure la dernière colonne non terminale à la réouverture", () => {
    const state = stateWithTicket()
    const completed = apply(
      state,
      success(
        decide(
          state,
          command({
            _tag: "ticket.complete",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )
    const reopened = apply(
      completed,
      success(
        decide(
          completed,
          command({
            _tag: "ticket.reopen",
            ...meta,
            payload: { ticketId: ids.ticket },
          }),
        ),
      ),
    )

    expect(reopened.tickets[0]).toMatchObject({
      done: false,
      columnId: ids.backlog,
    })
  })
})

describe("destructive guards", () => {
  it("exige confirmation avant de clôturer avec une exécution active", () => {
    const state = stateWithTicket()
    const ticket = state.tickets[0]
    if (ticket === undefined) {
      throw new Error("Missing fixture ticket")
    }
    const guarded: BoardState = {
      ...state,
      tickets: [{ ...ticket, activeExecutionId: executionId }],
    }
    const error = failure(
      decide(
        guarded,
        command({
          _tag: "ticket.complete",
          ...meta,
          payload: { ticketId: ids.ticket },
        }),
      ),
    )

    expect(error._tag).toBe("ActiveExecutionConfirmationRequired")
  })

  it("refuse de supprimer Done", () => {
    const error = failure(
      decide(
        initialized(),
        command({
          _tag: "kanbanColumn.delete",
          ...meta,
          payload: { columnId: ids.done },
        }),
      ),
    )

    expect(error._tag).toBe("ProtectedDoneColumn")
  })

  it("exige une destination pour supprimer une colonne non vide", () => {
    const error = failure(
      decide(
        stateWithTicket(),
        command({
          _tag: "kanbanColumn.delete",
          ...meta,
          payload: { columnId: ids.backlog },
        }),
      ),
    )

    expect(error._tag).toBe("ColumnDestinationRequired")
  })

  it("clôture les Tickets quand leur colonne est supprimée vers Done", () => {
    const state = stateWithTicket()
    const events = success(
      decide(
        state,
        command({
          _tag: "kanbanColumn.delete",
          ...meta,
          payload: {
            columnId: ids.backlog,
            destinationColumnId: ids.done,
          },
        }),
      ),
    )
    const next = apply(state, events)

    expect(events.map((event) => event._tag)).toEqual(["ticket.completed", "kanbanColumn.deleted"])
    expect(next.tickets[0]).toMatchObject({ done: true, columnId: ids.done })
  })
})

describe("execution.start", () => {
  it("refuse une exécution pour un Ticket bloqué", () => {
    const state = stateWithTicket()
    const ticket = state.tickets[0]
    if (ticket === undefined) {
      throw new Error("Missing fixture ticket")
    }
    const blocked: BoardState = {
      ...state,
      tickets: [{ ...ticket, openDependencyIds: [ticket2Id] }],
    }
    const error = failure(
      decide(
        blocked,
        command({
          _tag: "execution.start",
          ...meta,
          payload: {
            executionId: ids.execution,
            ticketId: ids.ticket,
            expectedOutcome: "A working board",
            agentProfileId: ids.profile,
            budget: { maxTokens: 10_000, timeoutSeconds: 1_800 },
            toolPolicy: { allowed: ["read", "edit"] },
          },
        }),
      ),
    )

    expect(error._tag).toBe("ExecutionBlockedByDependencies")
  })
})
