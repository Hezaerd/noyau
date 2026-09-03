// @vitest-environment happy-dom

import { describe, expect, it } from "vitest"

import { paintComposerPrompt } from "../src/components/thread/paint-composer-prompt"
import { serializeComposerPromptField } from "../src/lib/composer-prompt-field"

describe("composer skill chip", () => {
  it("paints known skills as atomic chips while preserving prompt text", () => {
    const editor = document.createElement("div")
    paintComposerPrompt(
      editor,
      "Use $write-docs now",
      [],
      [
        {
          name: "write-docs",
          displayName: "Write docs",
          description: "Update Noyau documentation",
          scope: "repo",
        },
      ],
    )

    expect(editor.querySelector("[data-composer-skill-chip]")?.textContent).toBe("Write docs")
    expect(serializeComposerPromptField(editor)).toBe("Use $write-docs now")
  })

  it("leaves unknown skill tokens as text", () => {
    const editor = document.createElement("div")
    paintComposerPrompt(editor, "Use $unknown now")

    expect(editor.querySelector("[data-composer-skill-chip]")).toBeNull()
    expect(editor.textContent).toBe("Use $unknown now")
  })
})
