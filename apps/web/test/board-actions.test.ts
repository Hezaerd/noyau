import { describe, expect, it } from "vite-plus/test"

import { createBoardActions, groupBoardActions, type BoardActions } from "../src/lib/board-actions"
import { boardFixture } from "./fixtures/board"

const makeActions = (executions: Array<string>): BoardActions => ({
  createTicket: () => {
    executions.push("ticket.create")
  },
  focusSearch: () => {
    executions.push("board.search")
  },
  deleteColumn: (columnId) => {
    executions.push(`column.delete:${columnId}`)
  },
  openTicket: (ticketId) => {
    executions.push(`ticket.open:${ticketId}`)
  },
  renameColumn: (columnId) => {
    executions.push(`column.rename:${columnId}`)
  },
  renameTicket: (ticketId) => {
    executions.push(`ticket.rename:${ticketId}`)
  },
})

describe("board actions", () => {
  it("exposes only page verbs to the Palette", () => {
    const executions: Array<string> = []
    const actions = createBoardActions(boardFixture, makeActions(executions))
    const groups = groupBoardActions(actions, "palette")

    expect(groups.map((group) => group.id)).toEqual(["actions"])
    expect(groups[0]?.actions.map((action) => action.id)).toEqual(["ticket.create", "board.search"])

    void groups[0]?.actions[0]?.execute()
    void groups[0]?.actions[1]?.execute()
    expect(executions).toEqual(["ticket.create", "board.search"])
  })

  it("exposes only target-specific actions to a context menu", () => {
    const actions = createBoardActions(boardFixture, makeActions([]))
    const groups = groupBoardActions(actions, "context-menu", {
      kind: "ticket",
      id: "ticket-http",
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.actions.map((action) => action.id)).toEqual([
      "ticket.open.ticket-http",
      "ticket.rename.ticket-http",
    ])
  })

  it("provides rename and delete actions for an ordinary column", () => {
    const executions: Array<string> = []
    const actions = createBoardActions(boardFixture, makeActions(executions))
    const groups = groupBoardActions(actions, "context-menu", {
      kind: "column",
      id: "column-active",
    })

    expect(groups[0]?.actions.map((action) => action.id)).toEqual([
      "column.rename.column-active",
      "column.delete.column-active",
    ])
    void groups[0]?.actions[0]?.execute()
    void groups[0]?.actions[1]?.execute()
    expect(executions).toEqual(["column.rename:column-active", "column.delete:column-active"])
  })

  it("keeps per-ticket and move destinations out of the Palette", () => {
    const actions = createBoardActions(boardFixture, makeActions([]))
    const paletteIds = groupBoardActions(actions, "palette").flatMap((group) =>
      group.actions.map((action) => action.id),
    )

    expect(paletteIds.some((id) => id.startsWith("ticket.open."))).toBe(false)
    expect(paletteIds.some((id) => id.startsWith("ticket.move."))).toBe(false)
  })
})
