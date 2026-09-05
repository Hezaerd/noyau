// @vitest-environment happy-dom

import { describe, expect, it } from "vitest"

import {
  composerPromptFieldCaretOffset,
  serializeComposerPromptField,
  serializeComposerPromptSelection,
  setComposerPromptFieldCaret,
} from "../src/lib/composer-prompt-field"

const mentionNode = (source: string): HTMLElement => {
  const node = document.createElement("span")
  node.dataset.composerMention = "true"
  node.dataset.mentionSource = source
  node.textContent = "chip"
  return node
}

describe("serializeComposerPromptField", () => {
  it("keeps mention sources and surrounding text", () => {
    const root = document.createElement("div")
    root.append("Voir ")
    root.append(mentionNode("@AGENTS.md"))
    root.append(" ensuite")
    expect(serializeComposerPromptField(root)).toBe("Voir @AGENTS.md ensuite")
  })

  it("treats a leftover caret break as empty", () => {
    const root = document.createElement("div")
    const line = document.createElement("div")
    line.append(document.createElement("br"))
    root.append(line)
    expect(serializeComposerPromptField(root)).toBe("")
  })
})

describe("serializeComposerPromptSelection", () => {
  it("copies mention sources instead of chip labels", () => {
    const root = document.createElement("div")
    document.body.append(root)
    root.append("Voir ")
    root.append(mentionNode("@.gitignore"))
    root.append(" ensuite")
    const selection = window.getSelection()
    selection?.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(root)
    selection?.addRange(range)
    expect(serializeComposerPromptSelection(root)).toBe("Voir @.gitignore ensuite")
    root.remove()
  })
})

describe("composerPromptField caret", () => {
  it("places the caret after a mention", () => {
    const root = document.createElement("div")
    document.body.append(root)
    root.append("Voir ")
    root.append(mentionNode("@AGENTS.md"))
    root.append(" x")
    root.contentEditable = "true"
    setComposerPromptFieldCaret(root, "Voir @AGENTS.md".length)
    expect(composerPromptFieldCaretOffset(root)).toBe("Voir @AGENTS.md".length)
    root.remove()
  })
})
