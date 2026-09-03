import { describe, expect, it } from "vitest"

import {
  clipTurnMinimapMarkdown,
  replaceMermaidFencesForPreview,
} from "../src/lib/thread-turn-minimap"

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
})
