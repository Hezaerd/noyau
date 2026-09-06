import { BoardSnapshot } from "@noyau/contracts/board"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { boardStateFromSnapshot } from "../src/lib/board-snapshot"

describe("boardStateFromSnapshot", () => {
  it("maps durable order and the dependency DAG", () => {
    const snapshot = Schema.decodeSync(BoardSnapshot)({
      snapshotSequence: 2,
      projectId: "10000000-0000-4000-8000-000000000001",
      project: {
        id: "10000000-0000-4000-8000-000000000001",
        name: "Noyau",
        workspaceRoot: "/workspace/noyau",
        defaultModelSelection: null,
        available: true,
        createdAt: "2026-08-14T12:00:00.000Z",
        updatedAt: "2026-08-14T12:00:00.000Z",
      },
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
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "30000000-0000-4000-8000-000000000003",
          projectId: "10000000-0000-4000-8000-000000000001",
          columnId: "20000000-0000-4000-8000-000000000001",
          rank: "aA",
          title: "Tied",
          priority: "normal",
          done: false,
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "30000000-0000-4000-8000-000000000003",
          projectId: "10000000-0000-4000-8000-000000000001",
          columnId: "20000000-0000-4000-8000-000000000001",
          rank: "az",
          title: "Tied duplicate",
          priority: "normal",
          done: false,
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "30000000-0000-4000-8000-000000000004",
          projectId: "10000000-0000-4000-8000-000000000001",
          columnId: "20000000-0000-4000-8000-000000000003",
          rank: "aa",
          title: "Unknown column",
          priority: "low",
          done: false,
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "30000000-0000-4000-8000-000000000005",
          projectId: "10000000-0000-4000-8000-000000000001",
          columnId: "20000000-0000-4000-8000-000000000001",
          rank: "ab",
          title: "Archived",
          priority: "normal",
          done: false,
          archivedAt: "2026-08-14T12:00:00.000Z",
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
        },
        {
          id: "30000000-0000-4000-8000-000000000006",
          projectId: "10000000-0000-4000-8000-000000000001",
          columnId: "20000000-0000-4000-8000-000000000002",
          rank: "aa",
          title: "Done ticket",
          priority: "low",
          done: true,
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
      ticketThreads: [],
      ticketActivity: [],
    })

    const board = boardStateFromSnapshot(snapshot)

    expect(board.columns.map((column) => column.name)).toEqual(["Backlog", "Done"])
    expect(
      Object.fromEntries(board.tickets.map((ticket) => [ticket.title, ticket.position])),
    ).toEqual({
      First: 0,
      Second: 2,
      Tied: 1,
      "Tied duplicate": 1,
      "Unknown column": 0,
      "Done ticket": 0,
    })
    expect(board.tickets.map((ticket) => ticket.title)).toEqual([
      "Second",
      "First",
      "Tied",
      "Tied duplicate",
      "Unknown column",
      "Done ticket",
    ])
    expect(board.tickets.map((ticket) => ticket.title)).not.toContain("Archived")
    expect(board.ticketDependencies).toEqual([
      {
        ticketId: "30000000-0000-4000-8000-000000000002",
        dependsOnTicketId: "30000000-0000-4000-8000-000000000001",
      },
    ])
  })
})
