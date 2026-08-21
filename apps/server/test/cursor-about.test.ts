import {
  isCursorAboutJsonFormatUnsupported,
  parseCursorAboutOutput,
} from "@noyau/server/provider/cursor-about"
import { describe, expect, it } from "vite-plus/test"

describe("parseCursorAboutOutput", () => {
  it("reads version and plan from json, ignoring email", () => {
    expect(
      parseCursorAboutOutput({
        code: 0,
        stdout: JSON.stringify({
          cliVersion: "2026.04.09-f2b0fcd",
          subscriptionTier: "Team",
          userEmail: "secret@example.com",
        }),
        stderr: "",
      }),
    ).toEqual({
      version: "2026.04.09-f2b0fcd",
      plan: "Team",
    })
  })

  it("maps known subscription tiers to a short plan label", () => {
    expect(
      parseCursorAboutOutput({
        code: 0,
        stdout: JSON.stringify({ cliVersion: "1.0.0", subscriptionTier: "pro" }),
        stderr: "",
      }).plan,
    ).toBe("Pro")
  })

  it("falls back to key-value about text when json is absent", () => {
    expect(
      parseCursorAboutOutput({
        code: 0,
        stdout: ["About Cursor CLI", "", "CLI Version         2026.03.20-44cb435"].join("\n"),
        stderr: "",
      }),
    ).toEqual({
      version: "2026.03.20-44cb435",
      plan: null,
    })
  })

  it("returns empty probe fields for an unknown about command", () => {
    expect(
      parseCursorAboutOutput({
        code: 1,
        stdout: "",
        stderr: "error: unknown command 'about'",
      }),
    ).toEqual({ version: null, plan: null })
  })
})

describe("isCursorAboutJsonFormatUnsupported", () => {
  it("detects CLIs that reject --format json", () => {
    expect(
      isCursorAboutJsonFormatUnsupported({
        code: 1,
        stdout: "",
        stderr: "error: unknown option '--format'",
      }),
    ).toBe(true)
    expect(
      isCursorAboutJsonFormatUnsupported({
        code: 0,
        stdout: '{"cliVersion":"1"}',
        stderr: "",
      }),
    ).toBe(false)
  })
})
