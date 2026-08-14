import { describe, expect, it } from "@effect/vitest"
import { Command } from "@noyau/protocol/commands"
import { Message } from "@noyau/protocol/entities/message"
import { DomainEvent } from "@noyau/protocol/events"
import { TicketReceipt } from "@noyau/protocol/receipts"
import { Schema } from "effect"

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  thread: "20000000-0000-4000-8000-000000000001",
  message: "30000000-0000-4000-8000-000000000001",
  ticket: "40000000-0000-4000-8000-000000000001",
  execution: "50000000-0000-4000-8000-000000000001",
  run: "60000000-0000-4000-8000-000000000001",
  command: "70000000-0000-4000-8000-000000000001",
  correlation: "80000000-0000-4000-8000-000000000001",
} as const

describe("collaboration protocol", () => {
  it("relie les messages aux Tickets, Executions et AgentRuns", () => {
    const references = {
      ticketId: ids.ticket,
      executionId: ids.execution,
      runId: ids.run,
    }
    const command = Schema.decodeSync(Command)({
      _tag: "message.send",
      commandId: ids.command,
      projectId: ids.project,
      actorId: "human:hezaerd",
      correlationId: ids.correlation,
      issuedAt: "2026-08-14T12:00:00.000Z",
      schemaVersion: 1,
      payload: {
        messageId: ids.message,
        threadId: ids.thread,
        kind: "report",
        body: "Terminé",
        ...references,
      },
    })
    const event = Schema.decodeSync(DomainEvent)({
      _tag: "message.sent",
      messageId: ids.message,
      threadId: ids.thread,
      kind: "report",
      body: "Terminé",
      ...references,
    })
    const message = Schema.decodeSync(Message)({
      id: ids.message,
      threadId: ids.thread,
      projectId: ids.project,
      authorId: "human:hezaerd",
      kind: "report",
      body: "Terminé",
      createdAt: "2026-08-14T12:00:00.000Z",
      ...references,
    })

    expect(command.payload).toMatchObject(references)
    expect(event).toMatchObject(references)
    expect(message).toMatchObject(references)
  })

  it("décode un receipt Ticket sans union legacy", () => {
    expect(
      Schema.decodeSync(TicketReceipt)({
        commandId: ids.command,
        response: { _tag: "accepted", eventIds: [] },
      }).response._tag,
    ).toBe("accepted")
  })
})
