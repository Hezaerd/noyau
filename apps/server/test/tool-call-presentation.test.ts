import {
  deriveToolCallPresentation,
  mergeToolCallPresentationInput,
} from "@noyau/server/provider/tool-call-presentation"
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
      action: "search",
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
      action: "read",
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
      action: "command",
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
      action: "command",
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
      action: "file_change",
      name: "Changed files",
      outputSummary: "apps/web/src/lib/thread-transcript.ts",
    })
  })

  it("infers a write from rawInput.content and never uses the file body", () => {
    expect(
      deriveToolCallPresentation({
        rawInput: {
          content: '# VETOSUD — Prototype commercial\nimport { Image } from "astro:assets";\n',
        },
      }),
    ).toEqual({
      action: "file_change",
      name: "Wrote file",
    })
  })

  it("uses an ACP diff path when Cursor omits locations", () => {
    expect(
      deriveToolCallPresentation({
        rawInput: { content: 'export const title = "VetoSud";\n' },
        content: [{ type: "diff", path: "src/pages/index.astro" }],
      }),
    ).toEqual({
      action: "file_change",
      name: "Wrote file",
      outputSummary: "src/pages/index.astro",
    })
  })

  it("drops a JSON dump that slipped into a summary field", () => {
    expect(
      deriveToolCallPresentation({
        kind: "search",
        rawInput: { query: '{"content":"# VETOSUD — Prototype commercial"}' },
      }),
    ).toEqual({
      action: "search",
      name: "Searched files",
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
      action: "read",
      name: "Read file",
    })
  })

  it("infers a read from a location when Cursor omits kind and title", () => {
    expect(
      deriveToolCallPresentation({
        title: "Cursor tool",
        locations: [
          {
            path: "/Users/hezaerd/Library/Application Support/Electron/environment/worktrees/noyau/src/index.ts",
          },
        ],
      }),
    ).toEqual({
      action: "read",
      name: "Read file",
      outputSummary:
        "/Users/hezaerd/Library/Application Support/Electron/environment/worktrees/noyau/src/index.ts",
    })
  })

  it("falls back to the title when kind and structured input are missing", () => {
    expect(
      deriveToolCallPresentation({
        title: "Inspect files",
      }),
    ).toEqual({
      action: "other",
      name: "Inspect files",
    })
  })

  it("never uses a missing title as Cursor tool when kind is present", () => {
    expect(deriveToolCallPresentation({ kind: "think" })).toEqual({
      action: "think",
      name: "Thinking",
    })
  })

  it("uses a provider-agnostic fallback when nothing classifies the tool", () => {
    expect(deriveToolCallPresentation({ title: "Cursor tool" })).toEqual({
      action: "other",
      name: "Tool",
    })
  })

  it("keeps the classified snapshot across a status-only ACP patch", () => {
    const started = {
      title: "Read File",
      kind: "read",
      locations: [{ path: "src/index.ts" }],
    }
    expect(deriveToolCallPresentation(mergeToolCallPresentationInput(started, {}))).toEqual({
      action: "read",
      name: "Read file",
      outputSummary: "src/index.ts",
    })
  })

  it("classifies a later kind patch after a generic Cursor title", () => {
    expect(
      deriveToolCallPresentation(
        mergeToolCallPresentationInput(
          { title: "Cursor tool" },
          { kind: "read", locations: [{ path: "src/index.ts" }] },
        ),
      ),
    ).toEqual({
      action: "read",
      name: "Read file",
      outputSummary: "src/index.ts",
    })
  })

  it("ignores null ACP patch fields instead of wiping the snapshot", () => {
    expect(
      mergeToolCallPresentationInput(
        { title: "Read File", kind: "read", locations: [{ path: "src/index.ts" }] },
        { title: null, kind: null, locations: null },
      ),
    ).toEqual({
      title: "Read File",
      kind: "read",
      locations: [{ path: "src/index.ts" }],
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
      action: "read",
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
    expect(presentation).toMatchObject({
      action: "command",
      name: "Ran command",
    })
    expect(presentation.outputSummary?.endsWith("…")).toBe(true)
    expect(presentation.outputSummary?.length).toBeLessThanOrEqual(160)
  })
})
