import { isResumePrompt } from "@noyau/shared/resume-prompt"
import { describe, expect, it } from "vite-plus/test"

describe("isResumePrompt", () => {
  it("accepte les jetons de reprise", () => {
    expect(isResumePrompt("Reprends")).toBe(true)
    expect(isResumePrompt("reprends.")).toBe(true)
    expect(isResumePrompt("  Resume  ")).toBe(true)
    expect(isResumePrompt("continuer")).toBe(true)
  })

  it("refuse un vrai mandat", () => {
    expect(isResumePrompt("Les timers sont buggés")).toBe(false)
    expect(isResumePrompt("Reprends le fix timers")).toBe(false)
    expect(isResumePrompt("")).toBe(false)
  })
})
