import { ProviderInstanceId } from "@noyau/contracts/entities/environment"
import { ApprovalRequestId, ThreadId } from "@noyau/contracts/ids"
import { UserInputContinueRequest } from "@noyau/contracts/thread/commands"
import { Crypto, Effect, Schema } from "effect"
import { describe, expect, it } from "vite-plus/test"

import { makeUserInputContinueRequest } from "../src/lib/thread-commands"

const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: () => Effect.succeed(new Uint8Array()),
})

describe("user-input.continue command", () => {
  it("builds the finalized continuation payload", () => {
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
    const requestId = ApprovalRequestId.make("request-continue")
    const request = Effect.runSync(
      makeUserInputContinueRequest({
        threadId,
        requestId,
        answers: { architecture: { optionIds: ["events"] } },
        provider: ProviderInstanceId.make("codex"),
        runtimeMode: "full-access",
        modelSelection: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
        prepareWorktree: { baseBranch: "main", startFromOrigin: true },
      }).pipe(Effect.provideService(Crypto.Crypto, crypto)),
    )

    expect(Schema.is(UserInputContinueRequest)(request)).toBe(true)
    expect(request.payload).toEqual({
      threadId,
      requestId,
      answers: { architecture: { optionIds: ["events"] } },
      provider: "codex",
      runtimeMode: "full-access",
      modelSelection: { modelId: "gpt-5.6-luna", reasoningEffort: "high" },
      prepareWorktree: { baseBranch: "main", startFromOrigin: true },
    })
  })
})
