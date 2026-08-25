import {
  MAX_BUFFERED_ASSISTANT_CHARS,
  takeBufferedAssistantSpill,
} from "@noyau/server/provider/assistant-delivery"
import { describe, expect, it } from "vite-plus/test"

describe("assistant delivery", () => {
  it("keeps tokens in memory until the t3code spill cap", () => {
    expect(takeBufferedAssistantSpill("", "hello")).toEqual({ pending: "hello", spill: "" })
    expect(takeBufferedAssistantSpill("hello", " world")).toEqual({
      pending: "hello world",
      spill: "",
    })

    const exact = "x".repeat(MAX_BUFFERED_ASSISTANT_CHARS)
    expect(takeBufferedAssistantSpill("", exact)).toEqual({ pending: exact, spill: "" })
    expect(takeBufferedAssistantSpill(exact, "y")).toEqual({ pending: "", spill: `${exact}y` })
  })
})
