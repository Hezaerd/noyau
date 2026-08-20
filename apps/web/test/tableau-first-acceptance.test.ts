import { ProjectId } from "@noyau/protocol/ids"
import { RPC_METHODS, SubscribeProjectInput, SubscribeShellInput } from "@noyau/protocol/rpc"
import { Crypto, Effect, Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { makeProjectCreateRequest } from "../src/lib/project-commands"

const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: () => Effect.succeed(new Uint8Array()),
})

const runBuilder = <A, E>(builder: Effect.Effect<A, E, Crypto.Crypto>): A =>
  Effect.runSync(builder.pipe(Effect.provideService(Crypto.Crypto, crypto)))

describe("tableau-first acceptance contract", () => {
  it("links an existing folder through the project command boundary", () => {
    const request = runBuilder(
      makeProjectCreateRequest({
        name: "  Mon dossier  ",
        workspaceRoot: "/workspace/mon-dossier",
      }),
    )

    expect(request._tag).toBe("project.create")
    expect(request.payload.name).toBe("Mon dossier")
    expect(request.payload.workspaceRoot).toBe("/workspace/mon-dossier")
  })

  it("uses snapshot-first shell and project subscriptions with a cursor", () => {
    const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")

    expect(RPC_METHODS.subscribeShell).toBe("orchestration.subscribeShell")
    expect(RPC_METHODS.subscribeProject).toBe("orchestration.subscribeProject")
    expect(Schema.decodeSync(SubscribeShellInput)({ afterSequence: 7 })).toEqual({
      afterSequence: 7,
    })
    expect(
      Schema.decodeSync(SubscribeProjectInput)({
        projectId,
        afterSequence: 7,
      }),
    ).toEqual({ projectId, afterSequence: 7 })
  })
})
