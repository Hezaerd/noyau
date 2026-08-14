import { describe, expect, it } from "vite-plus/test"

import {
  addColumn,
  createTicket,
  initialBoardState,
  moveTicket,
  parseBoardSearch,
  reorderTicket,
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
      assignee: "agent:claude",
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

  it("filters by query, assignee, and priority", () => {
    const visible = visibleTickets(initialBoardState, "column-active", {
      query: "interface",
      assignee: "agent:claude",
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

  it("clears optional metadata instead of retaining undefined properties", () => {
    const next = updateTicket(initialBoardState, "ticket-sheet", {
      dueAt: undefined,
      assigneeId: undefined,
    })
    const ticket = next.tickets.find((candidate) => candidate.id === "ticket-sheet")

    expect(ticket).toBeDefined()
    expect(Object.hasOwn(ticket ?? {}, "dueAt")).toBe(false)
    expect(Object.hasOwn(ticket ?? {}, "assigneeId")).toBe(false)
  })
})
