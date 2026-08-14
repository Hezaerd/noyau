import { BoardSnapshot } from "@noyau/protocol/board"
import { Execution } from "@noyau/protocol/entities/execution"
import { Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { boardStateFromSnapshot, withExecutionSummaries } from "../src/lib/board-snapshot"

describe("boardStateFromSnapshot", () => {
  it("ordonne les colonnes et tickets selon leurs ranks durables", () => {
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
          checklist: [],
          attachmentIds: [],
          workbenchThreadId: "40000000-0000-4000-8000-000000000002",
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
          checklist: [],
          attachmentIds: [],
          workbenchThreadId: "40000000-0000-4000-8000-000000000001",
          createdAt: "2026-08-14T12:00:00.000Z",
          updatedAt: "2026-08-14T12:00:00.000Z",
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
  })

  it("hydrate les résumés d'exécution dès le chargement du Tableau", () => {
    const board = {
      actors: [
        {
          id: "agent:claude",
          profileId: "71000000-0000-4000-8000-000000000002",
          name: "Claude",
          initials: "CL",
          role: "Développement",
          kind: "agent" as const,
        },
      ],
      columns: [],
      tickets: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          columnId: "20000000-0000-4000-8000-000000000001",
          position: 0,
          title: "Ticket exécuté",
          description: "",
          priority: "normal" as const,
          labels: [],
          checklist: [],
          blockedBy: [],
          messages: [],
          activity: [],
        },
      ],
    }
    const execution = Schema.decodeSync(Execution)({
      id: "50000000-0000-4000-8000-000000000001",
      ticketId: "30000000-0000-4000-8000-000000000001",
      projectId: "10000000-0000-4000-8000-000000000001",
      expectedOutcome: "Terminé",
      agentProfileId: "71000000-0000-4000-8000-000000000002",
      budget: { maxTokens: 1000, timeoutSeconds: 60 },
      toolPolicy: { allowed: [] },
      createdAt: "2026-08-14T12:00:00.000Z",
    })

    expect(withExecutionSummaries(board, [execution]).tickets[0]?.execution).toEqual({
      count: 1,
      profiles: ["Claude"],
      status: "running",
    })
  })
})
