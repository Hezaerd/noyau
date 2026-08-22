import {
  collectComposerInlineTokens,
  composerPromptSegments,
} from "@noyau/shared/composer-inline-tokens"
import { describe, expect, it } from "vite-plus/test"

describe("collectComposerInlineTokens", () => {
  it("collects file links, mentions, and skills with source ranges", () => {
    const text = "see [index.ts](src/index.ts) and @docs/readme.md then $grill "
    expect(collectComposerInlineTokens(text)).toEqual([
      {
        type: "mention",
        value: "src/index.ts",
        source: "[index.ts](src/index.ts)",
        start: 4,
        end: 28,
      },
      {
        type: "mention",
        value: "docs/readme.md",
        source: "@docs/readme.md",
        start: 33,
        end: 48,
      },
      {
        type: "skill",
        value: "grill",
        source: "$grill",
        start: 54,
        end: 60,
      },
    ])
  })

  it("collects a trailing mention without a following space", () => {
    expect(collectComposerInlineTokens("look @src/a.ts")).toEqual([
      {
        type: "mention",
        value: "src/a.ts",
        source: "@src/a.ts",
        start: 5,
        end: 14,
      },
    ])
  })

  it("collects quoted mention paths with whitespace", () => {
    expect(collectComposerInlineTokens('open @"docs/My File.md"')).toEqual([
      {
        type: "mention",
        value: "docs/My File.md",
        source: '@"docs/My File.md"',
        start: 5,
        end: 23,
      },
    ])
  })

  it("collects mentions wrapped in markdown or trailing punctuation", () => {
    expect(collectComposerInlineTokens("voir **@astro.config.mjs**.")).toEqual([
      {
        type: "mention",
        value: "astro.config.mjs",
        source: "@astro.config.mjs",
        start: 7,
        end: 24,
      },
    ])
    expect(collectComposerInlineTokens("voir (@src/a.ts)")[0]?.source).toBe("@src/a.ts")
  })

  it("treats scoped-looking paths as mentions", () => {
    expect(collectComposerInlineTokens("install @scope/package")).toEqual([
      {
        type: "mention",
        value: "scope/package",
        source: "@scope/package",
        start: 8,
        end: 22,
      },
    ])
  })
})

describe("composerPromptSegments", () => {
  it("keeps plain text as a single segment", () => {
    expect(composerPromptSegments("Implement the adapter")).toEqual([
      { type: "text", text: "Implement the adapter" },
    ])
  })

  it("splits text around mentions and keeps unresolved source on the mention", () => {
    expect(composerPromptSegments("look at @src/a.ts please")).toEqual([
      { type: "text", text: "look at " },
      { type: "mention", path: "src/a.ts", source: "@src/a.ts" },
      { type: "text", text: " please" },
    ])
  })

  it("leaves skills in the surrounding text", () => {
    expect(composerPromptSegments("run $grill now")).toEqual([
      { type: "text", text: "run $grill now" },
    ])
  })
})
