import { CommandId, ProjectId, Sequence, ThreadId, TicketId } from "@noyau/protocol/ids"
import { RPC_METHODS, SubscribeThreadInput } from "@noyau/protocol/rpc"
import { ThreadTurnStartRequest } from "@noyau/protocol/thread/commands"
import { Crypto, Effect, Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { acceptsSequence } from "../src/lib/control-plane"
import {
  makeThreadArchiveRequest,
  makeThreadCreateRequest,
  makeThreadMetaUpdateRequest,
  makeThreadRuntimeModeSetRequest,
  makeThreadTurnStartRequest,
  runtimeModes,
} from "../src/lib/thread-commands"
import {
  makeTicketThreadLinkRequest,
  makeTicketThreadUnlinkRequest,
} from "../src/lib/ticket-commands"

const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: () => Effect.succeed(new Uint8Array()),
})

const ids = {
  projectId: ProjectId.make("10000000-0000-4000-8000-000000000001"),
  threadId: ThreadId.make("20000000-0000-4000-8000-000000000001"),
  ticketId: TicketId.make("30000000-0000-4000-8000-000000000001"),
}

const runBuilder = <A, E>(builder: Effect.Effect<A, E, Crypto.Crypto>): A =>
  Effect.runSync(builder.pipe(Effect.provideService(Crypto.Crypto, crypto)))

describe("Thread and TicketThread UI acceptance contract", () => {
  it("seeds a required Thread title from the first prompt and starts a text-only Turn", () => {
    const prompt = "  Corriger le flux de reprise  "
    const created = runBuilder(
      makeThreadCreateRequest({
        threadId: ids.threadId,
        projectId: ids.projectId,
        title: prompt,
      }),
    )
    const started = runBuilder(
      makeThreadTurnStartRequest({
        threadId: ids.threadId,
        text: prompt,
      }),
    )

    expect(created.payload.title).toBe("Corriger le flux de reprise")
    expect(started.payload.text).toBe("Corriger le flux de reprise")
    expect(Schema.is(ThreadTurnStartRequest)(started)).toBe(true)
  })

  it("rejects image attachments at the same boundary used by the composer", () => {
    expect(() =>
      Schema.decodeSync(ThreadTurnStartRequest)({
        _tag: "thread.turn.start",
        commandId: CommandId.make("40000000-0000-4000-8000-000000000001"),
        payload: {
          threadId: ids.threadId,
          text: "Prompt",
          images: [{ name: "screen.png" }],
        },
      }),
    ).toThrow()
  })

  it("exposes all four runtime modes and the TicketThread link/unlink commands", () => {
    expect(runtimeModes.map((mode) => mode.value)).toEqual([
      "approval-required",
      "auto-accept-edits",
      "auto",
      "full-access",
    ])

    const modeRequest = runBuilder(
      makeThreadRuntimeModeSetRequest({
        threadId: ids.threadId,
        runtimeMode: "approval-required",
      }),
    )
    const linkRequest = runBuilder(
      makeTicketThreadLinkRequest({ ticketId: ids.ticketId, threadId: ids.threadId }),
    )
    const unlinkRequest = runBuilder(
      makeTicketThreadUnlinkRequest({ ticketId: ids.ticketId, threadId: ids.threadId }),
    )

    expect(modeRequest.payload.runtimeMode).toBe("approval-required")
    expect(linkRequest._tag).toBe("ticket.thread.link")
    expect(unlinkRequest._tag).toBe("ticket.thread.unlink")
  })

  it("renames and archives a Thread from the sidebar actions", () => {
    const renamed = runBuilder(
      makeThreadMetaUpdateRequest({
        threadId: ids.threadId,
        title: "  Titre mis à jour  ",
      }),
    )
    const archived = runBuilder(makeThreadArchiveRequest({ threadId: ids.threadId }))

    expect(renamed._tag).toBe("thread.meta.update")
    expect(renamed.payload.title).toBe("Titre mis à jour")
    expect(archived._tag).toBe("thread.archive")
    expect(archived.payload.threadId).toBe(ids.threadId)
  })

  it("uses the snapshot-first Thread stream and only accepts newer deltas", () => {
    expect(RPC_METHODS.subscribeThread).toBe("orchestration.subscribeThread")
    expect(
      Schema.decodeSync(SubscribeThreadInput)({
        threadId: ids.threadId,
        afterSequence: 12,
      }),
    ).toEqual({ threadId: ids.threadId, afterSequence: 12 })
    expect(acceptsSequence(undefined, Sequence.make(12))).toBe(true)
    expect(acceptsSequence(Sequence.make(12), Sequence.make(12))).toBe(false)
    expect(acceptsSequence(Sequence.make(12), Sequence.make(13))).toBe(true)
  })
})
