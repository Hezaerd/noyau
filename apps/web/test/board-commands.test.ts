import { describe, expect, it } from "vite-plus/test"

import {
  createBoardCommands,
  groupBoardCommands,
  type BoardCommandActions,
} from "../src/lib/board-commands"
import { initialBoardState } from "../src/lib/board-model"

const makeActions = (executions: Array<string>): BoardCommandActions => ({
  createTicket: () => {
    executions.push("ticket.create")
  },
  focusSearch: () => {
    executions.push("board.search")
  },
  deleteColumn: (columnId) => {
    executions.push(`column.delete:${columnId}`)
  },
  moveTicket: (ticketId, columnId) => {
    executions.push(`ticket.move:${ticketId}:${columnId}`)
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

describe("board commands", () => {
  it("groups commands for the palette without losing their execution", () => {
    const executions: Array<string> = []
    const commands = createBoardCommands(
      initialBoardState,
      "ticket-board-ui",
      makeActions(executions),
    )
    const groups = groupBoardCommands(commands, "palette")

    expect(groups.map((group) => group.id)).toEqual(["actions", "move", "tickets"])
    expect(groups[0]?.commands.map((command) => command.id)).toEqual([
      "ticket.create",
      "board.search",
    ])

    void groups
      .find((group) => group.id === "move")
      ?.commands.find((command) => command.id === "ticket.move.column-done")
      ?.execute()
    void groups
      .find((group) => group.id === "tickets")
      ?.commands.find((command) => command.id === "ticket.open.ticket-http")
      ?.execute()

    expect(executions).toEqual([
      "ticket.move:ticket-board-ui:column-done",
      "ticket.open:ticket-http",
    ])
  })

  it("exposes only target-specific commands to a context menu", () => {
    const commands = createBoardCommands(initialBoardState, undefined, makeActions([]))
    const groups = groupBoardCommands(commands, "context-menu", {
      kind: "ticket",
      id: "ticket-http",
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.commands.map((command) => command.id)).toEqual([
      "ticket.open.ticket-http",
      "ticket.rename.ticket-http",
    ])
  })

  it("provides rename and delete commands for an ordinary column", () => {
    const executions: Array<string> = []
    const commands = createBoardCommands(initialBoardState, undefined, makeActions(executions))
    const groups = groupBoardCommands(commands, "context-menu", {
      kind: "column",
      id: "column-active",
    })

    expect(groups[0]?.commands.map((command) => command.id)).toEqual([
      "column.rename.column-active",
      "column.delete.column-active",
    ])
    void groups[0]?.commands[0]?.execute()
    void groups[0]?.commands[1]?.execute()
    expect(executions).toEqual(["column.rename:column-active", "column.delete:column-active"])
  })

  it("disables and guards move commands when no ticket is active", () => {
    const executions: Array<string> = []
    const commands = createBoardCommands(initialBoardState, undefined, makeActions(executions))
    const move = commands.find((command) => command.id === "ticket.move.column-active")

    expect(move?.disabled).toBe(true)
    void move?.execute()
    expect(executions).toEqual([])
  })
})
