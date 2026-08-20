import { describe, expect, it } from "vite-plus/test"

import { parseCodeFence, resolveCodeBlockTitle } from "../src/lib/code-fence"

describe("parseCodeFence", () => {
  it("keeps a normal language identifier", () => {
    expect(parseCodeFence("typescript")).toEqual({
      language: "typescript",
      startLine: undefined,
      label: "typescript",
    })
  })

  it("maps a Cursor citation fence to language, start line and path", () => {
    expect(parseCodeFence("16:40:src/components/ClinicCard.astro")).toEqual({
      language: "astro",
      startLine: 16,
      label: "src/components/ClinicCard.astro",
    })
  })

  it("titles a fence with its language, or the citation path", () => {
    expect(resolveCodeBlockTitle(parseCodeFence("python"))).toBe("python")
    expect(resolveCodeBlockTitle(parseCodeFence("16:40:src/greet.py"))).toBe("src/greet.py")
    expect(resolveCodeBlockTitle(parseCodeFence(""))).toBe("text")
  })
})
