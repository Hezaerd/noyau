import { describe, expect, it } from "@effect/vitest"
import { Receipt } from "@noyau/protocol/receipts"
import { Schema } from "effect"

const decodeReceipt = Schema.decodeUnknownSync(Receipt)
const encodeReceipt = Schema.encodeSync(Receipt)

const commandId = "3f8f0d70-1111-4000-8000-000000000001"
const taskId = "3f8f0d70-1111-4000-8000-000000000002"
const ticketId = "3f8f0d70-1111-4000-8000-000000000004"

describe("Receipt", () => {
  it("décode et encode un receipt accepté", () => {
    const encoded = {
      commandId,
      response: {
        _tag: "accepted",
        eventIds: ["3f8f0d70-1111-4000-8000-000000000003"],
      },
    }

    expect(encodeReceipt(decodeReceipt(encoded))).toEqual(encoded)
  })

  it.each([
    { _tag: "TaskAlreadyExists", taskId },
    { _tag: "TaskNotFound", taskId },
    {
      _tag: "InvalidTaskTransition",
      taskId,
      status: "running",
      commandTag: "task.assign",
    },
    {
      _tag: "TaskAlreadyAssigned",
      taskId,
      assigneeId: "agent:marion",
    },
  ])("décode et encode le rejet métier $_tag", (error) => {
    const encoded = {
      commandId,
      response: {
        _tag: "rejected",
        error,
      },
    }

    expect(encodeReceipt(decodeReceipt(encoded))).toEqual(encoded)
  })

  it("décode et encode un rejet TicketNotFound dans le receipt générique", () => {
    const encoded = {
      commandId,
      response: {
        _tag: "rejected",
        error: {
          _tag: "TicketNotFound",
          ticketId,
        },
      },
    }

    expect(encodeReceipt(decodeReceipt(encoded))).toEqual(encoded)
  })

  it("rejette une erreur métier inconnue", () => {
    expect(() =>
      decodeReceipt({
        commandId,
        response: {
          _tag: "rejected",
          error: {
            _tag: "TaskExploded",
            taskId,
          },
        },
      }),
    ).toThrow()
  })
})
