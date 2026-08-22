import { describe, expect, it } from "vite-plus/test"

import {
  filePreviewMarkdown,
  isMarkdownFilePath,
  languageFromFilePath,
  wrapAsCodeFence,
} from "../src/lib/file-preview-markdown"

describe("languageFromFilePath", () => {
  it("reads the extension and aliases common variants", () => {
    expect(languageFromFilePath("veto-sud/src/data/site.ts")).toBe("ts")
    expect(languageFromFilePath("src/Button.tsx")).toBe("tsx")
    expect(languageFromFilePath("src/greet.py")).toBe("python")
    expect(languageFromFilePath("scripts/run.mjs")).toBe("javascript")
    expect(languageFromFilePath("config/tsconfig.json")).toBe("json")
    expect(languageFromFilePath("docker-compose.yml")).toBe("yaml")
  })

  it("maps extensionless well-known filenames", () => {
    expect(languageFromFilePath("Dockerfile")).toBe("dockerfile")
    expect(languageFromFilePath("Makefile")).toBe("makefile")
  })

  it("falls back to text without a usable extension", () => {
    expect(languageFromFilePath("LICENSE")).toBe("text")
    expect(languageFromFilePath(".gitignore")).toBe("text")
  })
})

describe("isMarkdownFilePath", () => {
  it("treats md, mdx and markdown as markdown", () => {
    expect(isMarkdownFilePath("AGENTS.md")).toBe(true)
    expect(isMarkdownFilePath("docs/guide.mdx")).toBe(true)
    expect(isMarkdownFilePath("notes.markdown")).toBe(true)
    expect(isMarkdownFilePath("src/data/site.ts")).toBe(false)
  })
})

describe("filePreviewMarkdown", () => {
  it("keeps markdown files as markdown", () => {
    expect(filePreviewMarkdown("README.md", "# Titre\n\nSalut")).toBe("# Titre\n\nSalut")
  })

  it("wraps other files in a language fence", () => {
    expect(filePreviewMarkdown("src/greet.py", "print('salut')")).toBe(
      "```python\nprint('salut')\n```",
    )
  })

  it("lengthens the fence when the source already contains backticks", () => {
    expect(wrapAsCodeFence("use `code` and ```ts\nnoop\n```", "txt")).toBe(
      "````txt\nuse `code` and ```ts\nnoop\n```\n````",
    )
  })
})
