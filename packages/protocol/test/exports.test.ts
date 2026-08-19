import { describe, expect, it } from "@effect/vitest"
import * as board from "@noyau/protocol/board"
import * as commands from "@noyau/protocol/commands"
import * as ticket from "@noyau/protocol/entities/ticket"
import * as events from "@noyau/protocol/events"
import * as ids from "@noyau/protocol/ids"
import * as receipts from "@noyau/protocol/receipts"
import * as rpc from "@noyau/protocol/rpc"
import * as ticketCommands from "@noyau/protocol/ticket/commands"
import * as ticketEvents from "@noyau/protocol/ticket/events"

describe("protocol exports", () => {
  it("ne publie plus Channel, Message, sourceThreadId ni EventCursor", () => {
    expect(ids).not.toHaveProperty("ChannelId")
    expect(ids).not.toHaveProperty("MessageId")
    expect(ids).not.toHaveProperty("AgentProfileId")
    expect(board).not.toHaveProperty("EventCursor")
    expect(ticket.Ticket.fields).not.toHaveProperty("sourceThreadId")
    expect(ticketCommands.TicketCreateRequest.fields.payload.fields).not.toHaveProperty(
      "sourceThreadId",
    )
    expect(ticketEvents.TicketCreated.fields).not.toHaveProperty("sourceThreadId")
    expect(commands).not.toHaveProperty("MessageSend")
    expect(events).not.toHaveProperty("MessageSent")
    expect(rpc).not.toHaveProperty("GetBoardSnapshot")
    expect(rpc).not.toHaveProperty("GetTicketActivity")
    expect(rpc).not.toHaveProperty("SubmitTicketCommand")
    expect(rpc).not.toHaveProperty("SubscribeProjectEvents")
    expect(rpc).not.toHaveProperty("EventCursor")
    expect(receipts).not.toHaveProperty("TicketReceipt")
  })
})
