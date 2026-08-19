import { describe, expect, it } from "@effect/vitest"
import {
  ControlPlaneRpcs,
  GetBoardSnapshot,
  GetTicketActivity,
  SubmitTicketCommand,
} from "@noyau/protocol/rpc"
import { Schema } from "effect"

describe("ControlPlaneRpcs", () => {
  it("expose la commande, le snapshot, l'activité Ticket et le flux projet", () => {
    expect([...ControlPlaneRpcs.requests.keys()].toSorted()).toEqual([
      "GetBoardSnapshot",
      "GetTicketActivity",
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

  it("borne la lecture d'activité à 100 événements", () => {
    const payload = {
      projectId: "10000000-0000-4000-8000-000000000001",
      ticketId: "30000000-0000-4000-8000-000000000001",
    }

    expect(Schema.decodeSync(GetTicketActivity.payloadSchema)(payload)).toEqual(payload)
    expect(
      Schema.decodeSync(GetTicketActivity.payloadSchema)({ ...payload, limit: 100 }).limit,
    ).toBe(100)
    expect(() =>
      Schema.decodeSync(GetTicketActivity.payloadSchema)({ ...payload, limit: 101 }),
    ).toThrow()
  })
})
