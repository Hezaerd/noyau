import { ThreadId, TurnId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vite-plus/test"

import { isForkComposerLocked } from "../src/lib/thread-fork"

const forkOrigin = {
  sourceThreadId: ThreadId.make("20000000-0000-4000-8000-000000000001"),
  sourceTurnId: TurnId.make("40000000-0000-4000-8000-000000000001"),
}

describe("fork composer availability", () => {
  it("waits for a native fork session and keeps a failed fork read-only", () => {
    expect(isForkComposerLocked({ forkOrigin, sessionStatus: "starting" })).toBe(true)
    expect(isForkComposerLocked({ forkOrigin, sessionStatus: "error" })).toBe(true)
    expect(isForkComposerLocked({ forkOrigin, sessionStatus: "ready" })).toBe(false)
  })

  it("does not restrict ordinary Thread sessions", () => {
    expect(isForkComposerLocked({ sessionStatus: "starting" })).toBe(false)
    expect(isForkComposerLocked({ sessionStatus: "error" })).toBe(false)
  })
})
