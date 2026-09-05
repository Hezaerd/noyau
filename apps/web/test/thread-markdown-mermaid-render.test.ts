import { describe, expect, it, vi } from "vitest"

import {
  mermaidConfigForAppearance,
  renderThreadMermaidChart,
} from "../src/lib/thread-markdown-mermaid"

const renderMermaid = vi.fn(async () => ({ svg: "<svg></svg>" }))

vi.mock("../src/lib/thread-markdown-plugins", () => ({
  threadMermaidPlugin: {
    getMermaid: () => ({
      initialize: () => undefined,
      render: renderMermaid,
    }),
  },
}))

describe("mermaidConfigForAppearance", () => {
  it("uses Mermaid's dark theme in dark appearance", () => {
    expect(mermaidConfigForAppearance("dark").theme).toBe("dark")
    expect(mermaidConfigForAppearance("light").theme).toBe("default")
    expect(mermaidConfigForAppearance("dark").securityLevel).toBe("strict")
  })
})

describe("renderThreadMermaidChart", () => {
  it("returns the rendered SVG", async () => {
    renderMermaid.mockResolvedValueOnce({ svg: "<svg data-ok></svg>" })
    await expect(renderThreadMermaidChart("graph TD\n  A --> B", "light")).resolves.toEqual({
      _tag: "ok",
      svg: "<svg data-ok></svg>",
    })
  })

  it("maps a thrown Error message to an error result", async () => {
    renderMermaid.mockRejectedValueOnce(new Error("Parse error on line 1"))
    await expect(renderThreadMermaidChart("nope", "dark")).resolves.toEqual({
      _tag: "error",
      message: "Parse error on line 1",
    })
  })
})
