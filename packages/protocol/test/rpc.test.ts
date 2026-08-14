import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"

import {
  ControlPlaneRpcs,
  GetBoardSnapshot,
  SubmitTicketCommand,
} from "../src/rpc"

describe("ControlPlaneRpcs", () => {
  it("expose la commande Ticket, le snapshot, les exécutions et le flux projet", () => {
    expect([...ControlPlaneRpcs.requests.keys()].toSorted()).toEqual([
      "GetBoardSnapshot",
      "GetTicketExecutions",
      "SubmitTicketCommand",
      "SubscribeProjectEvents",
    ])
  })

  it("décode une soumission ticket.create sans identité cliente", () => {
    const payload = Schema.decodeSync(SubmitTicketCommand.payloadSchema)({
      projectId: "10000000-0000-4000-8000-000000000001",
      request: {
        _tag: "ticket.create",
        commandId: "20000000-0000-4000-8000-000000000001",
        payload: {
          ticketId: "30000000-0000-4000-8000-000000000001",
          workbenchThreadId: "40000000-0000-4000-8000-000000000001",
          title: "Migrer la frontière",
          placement: {
            columnId: "50000000-0000-4000-8000-000000000001",
          },
        },
      },
    })

    expect(payload.request._tag).toBe("ticket.create")
    expect(payload).not.toHaveProperty("actorId")
  })

  it("exige seulement le projectId pour le snapshot", () => {
    expect(
      Schema.decodeSync(GetBoardSnapshot.payloadSchema)({
        projectId: "10000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({
      projectId: "10000000-0000-4000-8000-000000000001",
    })
  })
})
