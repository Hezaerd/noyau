import { TicketId } from "@noyau/protocol/ids"
import { Crypto, Effect } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  makeTicketDependencyAddRequest,
  makeTicketDependencyRemoveRequest,
} from "../src/lib/ticket-commands"

const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: () => Effect.succeed(new Uint8Array()),
})

const runBuilder = <A, E>(builder: Effect.Effect<A, E, Crypto.Crypto>): A =>
  Effect.runSync(builder.pipe(Effect.provideService(Crypto.Crypto, crypto)))

describe("ticket dependency command builders", () => {
  const ticketId = TicketId.make("30000000-0000-4000-8000-000000000001")
  const dependsOnTicketId = TicketId.make("30000000-0000-4000-8000-000000000002")

  it("builds the authoritative add command", () => {
    const request = runBuilder(makeTicketDependencyAddRequest({ ticketId, dependsOnTicketId }))

    expect(request._tag).toBe("ticket.dependency.add")
    expect(request.payload).toEqual({ ticketId, dependsOnTicketId })
  })

  it("builds the authoritative remove command", () => {
    const request = runBuilder(makeTicketDependencyRemoveRequest({ ticketId, dependsOnTicketId }))

    expect(request._tag).toBe("ticket.dependency.remove")
    expect(request.payload).toEqual({ ticketId, dependsOnTicketId })
  })
})
