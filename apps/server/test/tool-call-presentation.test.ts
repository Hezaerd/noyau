import { deriveToolCallPresentation } from "@noyau/server/provider/tool-call-presentation"
import { describe, expect, it } from "vite-plus/test"

describe("deriveToolCallPresentation", () => {
  it("maps a search tool to a stable label and query, ignoring raw output fields", () => {
    expect(
      deriveToolCallPresentation({
        title: "Inspect files",
        kind: "search",
        rawInput: { query: "mentions légales" },
      }),
    ).toEqual({
      name: "Searched files",
      outputSummary: "mentions légales",
    })
  })

  it("uses the first ACP location for a read tool", () => {
    expect(
      deriveToolCallPresentation({
        title: "Read File",
        kind: "read",
        locations: [{ path: "src/pages/mentions-legales.astro" }],
      }),
    ).toEqual({
      name: "Read file",
      outputSummary: "src/pages/mentions-legales.astro",
    })
  })

  it("maps execute tools to the command, not a generic terminal title", () => {
    expect(
      deriveToolCallPresentation({
        title: "Terminal",
        kind: "execute",
        rawInput: { command: "bun run lint" },
      }),
    ).toEqual({
      name: "Ran command",
      outputSummary: "bun run lint",
    })
  })

  it("joins executable and args when command is missing", () => {
    expect(
      deriveToolCallPresentation({
        kind: "execute",
        rawInput: { executable: "rg", args: ["-n", "ToolCall"] },
      }),
    ).toEqual({
      name: "Ran command",
      outputSummary: "rg -n ToolCall",
    })
  })

  it("maps edit tools to a changed-files label", () => {
    expect(
      deriveToolCallPresentation({
        title: "Edit a file",
        kind: "edit",
        rawInput: { path: "apps/web/src/lib/thread-transcript.ts" },
      }),
    ).toEqual({
      name: "Changed files",
      outputSummary: "apps/web/src/lib/thread-transcript.ts",
    })
  })

  it("drops a duplicated generic title when no path or query is available", () => {
    expect(
      deriveToolCallPresentation({
        title: "Read File",
        kind: "read",
        rawInput: {},
      }),
    ).toEqual({
      name: "Read file",
    })
  })

  it("falls back to the title when kind and structured input are missing", () => {
    expect(
      deriveToolCallPresentation({
        title: "Inspect files",
      }),
    ).toEqual({
      name: "Inspect files",
    })
  })

  it("never uses a missing title as Cursor tool when kind is present", () => {
    expect(deriveToolCallPresentation({ kind: "think" })).toEqual({
      name: "Thinking",
    })
  })

  it("keeps structured fields when Cursor sends extra rawInput keys", () => {
    expect(
      deriveToolCallPresentation({
        kind: "read",
        locations: [{ path: "src/index.ts" }],
        rawInput: {
          path: "src/index.ts",
          extra: { nested: true },
          content: "should-not-appear",
        },
      }),
    ).toEqual({
      name: "Read file",
      outputSummary: "src/index.ts",
    })
  })

  it("truncates a long command so the journal stays compact", () => {
    const command = `echo ${"a".repeat(200)}`
    const presentation = deriveToolCallPresentation({
      kind: "execute",
      rawInput: { command },
    })
    expect(presentation.name).toBe("Ran command")
    expect(presentation.outputSummary?.endsWith("…")).toBe(true)
    expect(presentation.outputSummary?.length).toBeLessThanOrEqual(160)
  })
})
