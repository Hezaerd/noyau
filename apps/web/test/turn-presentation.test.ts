import { describe, expect, it } from "vite-plus/test"

import {
  buildFixCiPrompt,
  buildFixMergeConflictsPrompt,
  FIX_CI_PRESENTATION,
  FIX_MERGE_CONFLICTS_PRESENTATION,
  turnPresentationLabel,
} from "../src/lib/turn-presentation"

describe("turn-presentation", () => {
  it("construit un prompt borné et un libellé stable", () => {
    expect(turnPresentationLabel(FIX_MERGE_CONFLICTS_PRESENTATION)).toBe("Fix merge conflicts")
    const prompt = buildFixMergeConflictsPrompt({
      number: 12,
      url: "https://github.com/hezaerd/noyau/pull/12",
      baseRef: "main",
      headRef: "feat/live",
    })
    expect(prompt).toContain("PR #12")
    expect(prompt).toContain("`main`")
    expect(prompt).toContain("`feat/live`")
    expect(
      buildFixMergeConflictsPrompt({
        number: 12,
        url: "https://github.com/hezaerd/noyau/pull/12",
        baseRef: "main`evil",
        headRef: "feat/live",
      }),
    ).not.toContain("`evil")
  })

  it("construit un prompt Fix CI borné", () => {
    expect(turnPresentationLabel(FIX_CI_PRESENTATION)).toBe("Fix CI")
    const prompt = buildFixCiPrompt({
      number: 12,
      url: "https://github.com/hezaerd/noyau/pull/12",
      baseRef: "main",
      headRef: "feat/live",
      failedChecks: [{ name: "Verify" }, { name: "Typecheck`evil" }],
    })
    expect(prompt).toContain("PR #12")
    expect(prompt).toContain("`Verify`")
    expect(prompt).toContain("`feat/live`")
    expect(prompt).toContain("`gh pr checks`")
    expect(prompt).not.toContain("`evil")
  })
})
