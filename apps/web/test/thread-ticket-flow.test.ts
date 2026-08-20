import type { ClientCommandRequest } from "@noyau/protocol/commands"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { KanbanColumnId, ProjectId, ThreadId, TurnId, type TicketId } from "@noyau/protocol/ids"
import { Crypto, Effect, Schema } from "effect"
import { describe, expect, it, vi } from "vite-plus/test"

import {
  createTicketFromThread,
  type ThreadTicketDraftSource,
  type TicketCreationBoard,
} from "../src/lib/create-ticket-from-thread"

const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: () => Effect.succeed(new Uint8Array()),
})

const runBuilder = <A, E>(
  builder: Effect.Effect<A, E, Crypto.Crypto>,
): Promise<{ readonly ok: true; readonly value: A }> =>
  Promise.resolve({
    ok: true,
    value: Effect.runSync(builder.pipe(Effect.provideService(Crypto.Crypto, crypto))),
  })

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const turnId = TurnId.make("40000000-0000-4000-8000-000000000001")
const columnId = KanbanColumnId.make("50000000-0000-4000-8000-000000000001")

const draft: ThreadTicketDraftSource = {
  thread: {
    title: "Corriger la reprise",
  },
  transcript: [
    Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.user",
      threadId,
      turnId,
      text: "Le premier besoin utilisateur.",
    }),
    Schema.decodeSync(TranscriptItem)({
      _tag: "transcript.assistant",
      threadId,
      turnId,
      text: "La réponse de Cursor.",
    }),
  ],
}

const board: TicketCreationBoard = {
  columns: [{ id: columnId, done: false }],
}

describe("Thread to Ticket flow", () => {
  it("dispatches create, transcript update, and link before opening the created Ticket", async () => {
    const dispatched: ClientCommandRequest[] = []
    const timeline: string[] = []
    let openedTicketId: TicketId | undefined
    const onError = vi.fn()
    const dispatch = async (request: ClientCommandRequest): Promise<boolean> => {
      dispatched.push(request)
      timeline.push(request._tag)
      return true
    }
    const onTicketCreated = (createdTicketId: TicketId): void => {
      openedTicketId = createdTicketId
      timeline.push(`navigate:${createdTicketId}`)
    }

    await createTicketFromThread({
      projectId,
      threadId,
      snapshot: draft,
      board,
      buildCommand: runBuilder,
      dispatch,
      onError,
      onTicketCreated,
    })

    expect(onError).not.toHaveBeenCalled()
    expect(dispatched.map((request) => request._tag)).toEqual([
      "ticket.create",
      "ticket.update",
      "ticket.thread.link",
    ])

    const createRequest = dispatched[0]
    const updateRequest = dispatched[1]
    const linkRequest = dispatched[2]
    if (
      createRequest === undefined ||
      updateRequest === undefined ||
      linkRequest === undefined ||
      createRequest._tag !== "ticket.create" ||
      updateRequest._tag !== "ticket.update" ||
      linkRequest._tag !== "ticket.thread.link"
    ) {
      throw new Error("Expected the three Ticket flow commands in order")
    }

    expect(createRequest.payload.projectId).toBe(projectId)
    expect(createRequest.payload.title).toBe(draft.thread.title)
    expect(createRequest.payload.placement.columnId).toBe(columnId)
    expect(updateRequest.payload.ticketId).toBe(createRequest.payload.ticketId)
    expect(updateRequest.payload.description).toContain("You:\nLe premier besoin utilisateur.")
    expect(updateRequest.payload.description).toContain("Cursor:\nLa réponse de Cursor.")
    expect(linkRequest.payload).toEqual({
      ticketId: createRequest.payload.ticketId,
      threadId,
    })
    expect(timeline).toEqual([
      "ticket.create",
      "ticket.update",
      "ticket.thread.link",
      `navigate:${createRequest.payload.ticketId}`,
    ])
    expect(openedTicketId).toBe(createRequest.payload.ticketId)
  })

  it("does not dispatch a link or navigate when Ticket creation is rejected", async () => {
    const dispatched: ClientCommandRequest[] = []
    const onTicketCreated = vi.fn()
    const onError = vi.fn()

    await createTicketFromThread({
      projectId,
      threadId,
      snapshot: draft,
      board,
      buildCommand: async () => ({
        ok: false,
        details: "Ticket refusé",
      }),
      dispatch: async (request) => {
        dispatched.push(request)
        return true
      },
      onError,
      onTicketCreated,
    })

    expect(dispatched).toEqual([])
    expect(onError).toHaveBeenCalledWith("Ticket refusé")
    expect(onTicketCreated).not.toHaveBeenCalled()
  })
})
