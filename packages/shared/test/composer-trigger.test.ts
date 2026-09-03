import {
  detectComposerTrigger,
  replaceTextRange,
  serializeComposerMentionPath,
} from "@noyau/shared/composer-trigger"
import { describe, expect, it } from "vitest"

describe("serializeComposerMentionPath", () => {
  it("keeps simple mention paths unquoted", () => {
    expect(serializeComposerMentionPath("src/index.ts")).toBe("src/index.ts")
  })

  it("quotes mention paths containing whitespace", () => {
    expect(serializeComposerMentionPath("docs/My File.md")).toBe('"docs/My File.md"')
  })

  it("escapes quoted mention path content", () => {
    expect(serializeComposerMentionPath('docs/My "File".md')).toBe('"docs/My \\"File\\".md"')
  })
})

describe("detectComposerTrigger", () => {
  it("detects an @path trigger at the cursor", () => {
    expect(detectComposerTrigger("see @src/ad", 11)).toEqual({
      kind: "path",
      query: "src/ad",
      rangeStart: 4,
      rangeEnd: 11,
    })
  })

  it("detects a /command trigger at the start of the line", () => {
    expect(detectComposerTrigger("/gh", 3)).toEqual({
      kind: "slash-command",
      query: "gh",
      rangeStart: 0,
      rangeEnd: 3,
    })
  })

  it("detects a $skill trigger", () => {
    expect(detectComposerTrigger("run $grill", 10)).toEqual({
      kind: "skill",
      query: "grill",
      rangeStart: 4,
      rangeEnd: 10,
    })
  })

  it("returns null when the cursor is not on a trigger", () => {
    expect(detectComposerTrigger("plain text", 5)).toBeNull()
  })
})

describe("replaceTextRange", () => {
  it("replaces the active trigger and places the cursor after the insert", () => {
    expect(replaceTextRange("see @src", 4, 8, "@src/index.ts ")).toEqual({
      text: "see @src/index.ts ",
      cursor: 18,
    })
  })
})
