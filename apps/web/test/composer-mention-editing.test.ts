import { describe, expect, it } from "vite-plus/test"

import { applyComposerMentionKey } from "../src/lib/composer-mention-editing"

describe("applyComposerMentionKey", () => {
  const text = "Voir @src/adapter.ts ensuite"

  it("deletes the whole mention on Backspace at its end", () => {
    expect(applyComposerMentionKey({ key: "Backspace", text, cursor: 20 })).toEqual({
      text: "Voir  ensuite",
      cursor: 5,
    })
  })

  it("jumps to the mention start on ArrowLeft from inside", () => {
    expect(applyComposerMentionKey({ key: "ArrowLeft", text, cursor: 12 })).toEqual({
      text,
      cursor: 5,
    })
  })

  it("leaves ordinary typing alone", () => {
    expect(applyComposerMentionKey({ key: "a", text, cursor: 2 })).toBeNull()
  })
})
