import { describe, expect, it } from "@effect/vitest"
import {
  emptyRemoteResourceState,
  withRemoteResourceError,
  withRemoteResourcePhase,
  withRemoteResourceValue,
} from "@noyau/client-runtime/state/runtime"

describe("RemoteResourceState", () => {
  it("conserve value après une erreur ou une resynchronisation", () => {
    const empty = emptyRemoteResourceState<string, Error>()
    expect(empty).toEqual({ value: undefined, phase: "empty", error: undefined })

    const live = withRemoteResourceValue(empty, "snapshot")
    expect(live).toEqual({ value: "snapshot", phase: "live", error: undefined })

    const synchronizing = withRemoteResourcePhase(live, "synchronizing")
    expect(synchronizing.value).toBe("snapshot")
    expect(synchronizing.phase).toBe("synchronizing")
    expect(synchronizing.error).toBeUndefined()

    const failed = withRemoteResourceError(live, new Error("métier"))
    expect(failed.value).toBe("snapshot")
    expect(failed.phase).toBe("synchronizing")
    expect(failed.error).toEqual(new Error("métier"))

    const reconnecting = withRemoteResourcePhase(failed, "synchronizing")
    expect(reconnecting.value).toBe("snapshot")
    expect(reconnecting.error).toEqual(new Error("métier"))
  })
})
