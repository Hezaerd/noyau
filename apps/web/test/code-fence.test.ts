import { describe, expect, it } from "vite-plus/test"

import {
  extractFenceTitle,
  isMermaidFenceLanguage,
  parseCodeFence,
  resolveCodeBlockFenceTitle,
  resolveCodeBlockLanguage,
  resolveCodeBlockTitle,
} from "../src/lib/code-fence"

describe("parseCodeFence", () => {
  it("keeps a normal language identifier", () => {
    expect(parseCodeFence("typescript")).toEqual({
      language: "typescript",
      startLine: undefined,
      label: "typescript",
      path: undefined,
    })
  })

  it("maps a Cursor citation fence to language, start line and path", () => {
    expect(parseCodeFence("16:40:src/components/ClinicCard.astro")).toEqual({
      language: "astro",
      startLine: 16,
      label: "src/components/ClinicCard.astro",
      path: "src/components/ClinicCard.astro",
    })
  })

  it("titles a fence with its language, or the citation path", () => {
    expect(resolveCodeBlockTitle(parseCodeFence("python"))).toBe("python")
    expect(resolveCodeBlockTitle(parseCodeFence("16:40:src/greet.py"))).toBe("src/greet.py")
    expect(resolveCodeBlockTitle(parseCodeFence(""))).toBe("text")
  })

  it("resolves the language fallback for an empty fence", () => {
    expect(resolveCodeBlockLanguage(parseCodeFence(""))).toBe("text")
    expect(resolveCodeBlockLanguage(parseCodeFence("ts"))).toBe("ts")
  })

  it("prefers a meta filename over the citation path", () => {
    const fence = parseCodeFence("16:40:src/greet.py")
    expect(resolveCodeBlockFenceTitle(fence, 'title="src/renamed.py"')).toBe("src/renamed.py")
    expect(resolveCodeBlockFenceTitle(fence, undefined)).toBe("src/greet.py")
    expect(resolveCodeBlockFenceTitle(parseCodeFence("python"), undefined)).toBeNull()
  })
})

describe("extractFenceTitle", () => {
  it("reads title, file and filename attributes", () => {
    expect(extractFenceTitle('title="src/main.ts"')).toBe("src/main.ts")
    expect(extractFenceTitle("file='App.tsx'")).toBe("App.tsx")
    expect(extractFenceTitle("filename=package.json")).toBe("package.json")
  })

  it("accepts a bare filename token in the meta string", () => {
    expect(extractFenceTitle("src/main.ts highlight")).toBe("src/main.ts")
  })

  it("returns null when meta has no filename", () => {
    expect(extractFenceTitle(undefined)).toBeNull()
    expect(extractFenceTitle("highlight noLineNumbers")).toBeNull()
  })
})

describe("isMermaidFenceLanguage", () => {
  it("matches mermaid regardless of case or padding", () => {
    expect(isMermaidFenceLanguage("mermaid")).toBe(true)
    expect(isMermaidFenceLanguage("Mermaid")).toBe(true)
    expect(isMermaidFenceLanguage(" mermaid ")).toBe(true)
  })

  it("rejects other fence languages", () => {
    expect(isMermaidFenceLanguage("ts")).toBe(false)
    expect(isMermaidFenceLanguage("mmd")).toBe(false)
    expect(isMermaidFenceLanguage("")).toBe(false)
  })
})
