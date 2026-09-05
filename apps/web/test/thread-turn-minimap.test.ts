import { describe, expect, it } from "vitest"

import {
  clipTurnMinimapMarkdown,
  replaceMermaidFencesForPreview,
} from "../src/lib/thread-turn-minimap"

const clipTurnMinimapMarkdownBeforeBound = (text: string): string => {
  const withoutDiagrams = replaceMermaidFencesForPreview(text)
  const lines = withoutDiagrams.split("\n")
  const clipped = lines.length > 12 ? lines.slice(0, 12).join("\n") : withoutDiagrams
  return clipped.length > 800 ? clipped.slice(0, 800) : clipped
}

describe("replaceMermaidFencesForPreview", () => {
  it("replaces a closed mermaid fence with a Diagram label", () => {
    expect(
      replaceMermaidFencesForPreview(
        "Flow:\n\n```mermaid\nsequenceDiagram\n    UI->>WS: attach\n```\n\nDone.",
      ),
    ).toBe("Flow:\n\nDiagram\n\nDone.")
  })

  it("replaces an unclosed mermaid fence at the end of the preview", () => {
    expect(replaceMermaidFencesForPreview("```mermaid\nsequenceDiagram\n    UI->>WS: attach")).toBe(
      "Diagram",
    )
  })

  it("keeps fences whose language only starts with mermaid", () => {
    const source = "```mermaid-js\ngraph TD\n    A --> B\n```"
    expect(replaceMermaidFencesForPreview(source)).toBe(source)
  })

  it("still replaces mermaid fences that have fence meta", () => {
    expect(
      replaceMermaidFencesForPreview('```mermaid title="flow"\ngraph TD\n    A --> B\n```'),
    ).toBe("Diagram")
  })
})

describe("clipTurnMinimapMarkdown", () => {
  it("does not dump mermaid source into the clipped preview", () => {
    const preview = clipTurnMinimapMarkdown(
      "Intro\n".repeat(4) +
        "```mermaid\nsequenceDiagram\n    participant UI\n    UI->>WS: attach\n```\n",
    )
    expect(preview).toContain("Intro")
    expect(preview).toContain("Diagram")
    expect(preview).not.toContain("sequenceDiagram")
  })

  it("preserves the character boundary", () => {
    const source = "x".repeat(800) + "tail"

    expect(clipTurnMinimapMarkdown(source)).toBe("x".repeat(800))
  })

  it.each([
    ["LF text", "a".repeat(799) + "\n" + "b".repeat(2)],
    ["CRLF text", "a".repeat(799) + "\r\n" + "b".repeat(2)],
    ["Unicode text", "a".repeat(798) + "é😀" + "b".repeat(2)],
    ["blank lines", "a".repeat(799) + "\n\n" + "b".repeat(2)],
    ["11 lines", Array.from({ length: 11 }, () => "line").join("\n")],
    ["12 lines", Array.from({ length: 12 }, () => "line").join("\n")],
    ["13 lines", Array.from({ length: 13 }, () => "line").join("\n")],
    ["Mermaid before character limit", "a".repeat(790) + "\n```mermaid\ngraph TD\nA-->B\n```"],
    ["Mermaid after character limit", "a".repeat(800) + "\n```mermaid\ngraph TD\nA-->B\n```"],
    ["open Mermaid across character limit", "a".repeat(790) + "\n```mermaid\n" + "x".repeat(2_000)],
  ] as const)("matches the previous clipping for $0", (_, source) => {
    expect(clipTurnMinimapMarkdown(source)).toBe(clipTurnMinimapMarkdownBeforeBound(source))
  })

  it("preserves a surrogate pair crossing the character limit", () => {
    const source = `${"a".repeat(799)}😀tail`

    expect(source.length).toBe(805)
    expect(clipTurnMinimapMarkdown(source)).toBe(clipTurnMinimapMarkdownBeforeBound(source))
    expect(clipTurnMinimapMarkdown(source).length).toBe(800)
  })

  it("preserves the line boundary", () => {
    const source = Array.from({ length: 13 }, (_, index) => String(index)).join("\n")

    expect(clipTurnMinimapMarkdown(source)).toBe(
      Array.from({ length: 12 }, (_, index) => String(index)).join("\n"),
    )
  })

  it("preserves trailing newlines and CRLF line endings", () => {
    expect(clipTurnMinimapMarkdown("first\r\nsecond\r\n")).toBe("first\r\nsecond\r\n")
    expect(clipTurnMinimapMarkdown("first\nsecond\nthird\n")).toBe("first\nsecond\nthird\n")
  })

  it("clips Mermaid replacement output at the boundaries", () => {
    const closedFence = `\`\`\`mermaid\n${"x\n".repeat(900)}\`\`\`\ntail`
    const openFence = `\`\`\`mermaid\n${"x\n".repeat(900)}`

    expect(clipTurnMinimapMarkdown(closedFence)).toBe("Diagram\ntail")
    expect(clipTurnMinimapMarkdown(openFence)).toBe("Diagram")
  })

  it("handles huge multiline input", () => {
    const source = "line\n".repeat(1_000_000)

    expect(clipTurnMinimapMarkdown(source)).toBe("line\n".repeat(11) + "line")
  })
})
