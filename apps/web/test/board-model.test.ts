import { describe, expect, it } from "vite-plus/test"

import {
  addColumn,
  createTicket,
  dependenciesForTicket,
  dependentsForTicket,
  initialBoardState,
  moveTicket,
  parseBoardSearch,
  reorderTicket,
  ticketDependencyIssue,
  ticketsInColumn,
  updateTicket,
  visibleTickets,
} from "../src/lib/board-model"

describe("board search", () => {
  it("keeps supported URL state and drops invalid values", () => {
    expect(
      parseBoardSearch({
        ticket: "ticket-board-ui",
        q: "interface",
        assignee: "agent:claude",
        priority: "urgent",
        ignored: "value",
      }),
    ).toEqual({
      ticket: "ticket-board-ui",
      q: "interface",
      priority: "urgent",
    })

    expect(parseBoardSearch({ q: "", priority: "impossible" })).toEqual({})
  })
})

describe("local board preview model", () => {
  it("never creates a ticket in Done", () => {
    const next = createTicket(initialBoardState, {
      id: "ticket-forbidden",
      columnId: "column-done",
      title: "Ne doit pas exister",
    })

    expect(next).toBe(initialBoardState)
    expect(next.tickets.some((ticket) => ticket.id === "ticket-forbidden")).toBe(false)
  })

  it("appends cross-column moves to the complete destination order", () => {
    const next = moveTicket(initialBoardState, "ticket-projection", "column-active")

    expect(ticketsInColumn(next, "column-active").map((ticket) => ticket.id)).toEqual([
      "ticket-board-ui",
      "ticket-reconciliation",
      "ticket-projection",
    ])
  })

  it("reorders within one column without changing its neighbors' column", () => {
    const next = reorderTicket(initialBoardState, "ticket-http", -1)

    expect(ticketsInColumn(next, "column-backlog").map((ticket) => ticket.id)).toEqual([
      "ticket-http",
      "ticket-projection",
      "ticket-sheet",
    ])
    expect(ticketsInColumn(next, "column-active")).toHaveLength(2)
  })

  it("filters by query and priority", () => {
    const visible = visibleTickets(initialBoardState, "column-active", {
      query: "interface",
      priority: "high",
    })

    expect(visible.map((ticket) => ticket.id)).toEqual(["ticket-board-ui"])
  })

  it("inserts a new ordinary column before Done", () => {
    const next = addColumn(initialBoardState, "Vérification", "column-review")

    expect(next.columns.map((column) => column.id)).toEqual([
      "column-backlog",
      "column-active",
      "column-review",
      "column-done",
    ])
  })

  it("clears an optional due date instead of retaining an undefined property", () => {
    const next = updateTicket(initialBoardState, "ticket-sheet", {
      dueAt: undefined,
    })
    const ticket = next.tickets.find((candidate) => candidate.id === "ticket-sheet")

    expect(ticket).toBeDefined()
    expect(Object.hasOwn(ticket ?? {}, "dueAt")).toBe(false)
  })

  it("calculates both directions of the dependency DAG", () => {
    expect(dependenciesForTicket(initialBoardState, "ticket-projection")).toEqual(["ticket-http"])
    expect(dependentsForTicket(initialBoardState, "ticket-http")).toEqual(["ticket-projection"])
  })

  it("rejects self, duplicate, and cyclic dependency edges", () => {
    expect(ticketDependencyIssue(initialBoardState, "ticket-http", "ticket-http")).toBe("self")
    expect(ticketDependencyIssue(initialBoardState, "ticket-projection", "ticket-http")).toBe(
      "duplicate",
    )
    expect(ticketDependencyIssue(initialBoardState, "ticket-http", "ticket-projection")).toBe(
      "cycle",
    )
    expect(ticketDependencyIssue(initialBoardState, "ticket-sheet", "ticket-http")).toBeUndefined()
  })
})
