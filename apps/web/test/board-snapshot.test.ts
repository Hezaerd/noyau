import { BoardSnapshot } from "@noyau/protocol/board"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { boardStateFromSnapshot } from "../src/lib/board-snapshot"

describe("boardStateFromSnapshot", () => {
  it("maps durable order and the dependency DAG", () => {
    const snapshot = Schema.decodeSync(BoardSnapshot)({
      projectId: "10000000-0000-4000-8000-000000000001",
      cursor: "v1.10000000-0000-4000-8000-000000000001.2",
      columns: [
        {
          id: "20000000-0000-4000-8000-000000000002",
          projectId: "10000000-0000-4000-8000-000000000001",
          name: "Done",
          color: "#10B981",
          rank: "aa",
          done: true,
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "20000000-0000-4000-8000-000000000001",
          projectId: "10000000-0000-4000-8000-000000000001",
          name: "Backlog",
          color: "#6D5BD0",
          rank: "aA",
          done: false,
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
      ],
      tickets: [
        {
          id: "30000000-0000-4000-8000-000000000002",
          projectId: "10000000-0000-4000-8000-000000000001",
          columnId: "20000000-0000-4000-8000-000000000001",
          rank: "aa",
          title: "Second",
          priority: "normal",
          done: false,
          participantIds: [],
          labelIds: [],
          attachmentIds: [],
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "30000000-0000-4000-8000-000000000001",
          projectId: "10000000-0000-4000-8000-000000000001",
          columnId: "20000000-0000-4000-8000-000000000001",
          rank: "aA",
          title: "First",
          priority: "high",
          done: false,
          participantIds: [],
          labelIds: [],
          attachmentIds: [],
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
      ],
      ticketDependencies: [
        {
          ticketId: "30000000-0000-4000-8000-000000000002",
          dependsOnTicketId: "30000000-0000-4000-8000-000000000001",
        },
      ],
    })

    const board = boardStateFromSnapshot(snapshot)

    expect(board.columns.map((column) => column.name)).toEqual(["Backlog", "Done"])
    expect(
      Object.fromEntries(board.tickets.map((ticket) => [ticket.title, ticket.position])),
    ).toEqual({
      First: 0,
      Second: 1,
    })
    expect(board.ticketDependencies).toEqual([
      {
        ticketId: "30000000-0000-4000-8000-000000000002",
        dependsOnTicketId: "30000000-0000-4000-8000-000000000001",
      },
    ])
  })
})
