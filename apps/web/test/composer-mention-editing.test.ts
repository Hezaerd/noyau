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

  it("deletes a ticket mention as a single chip", () => {
    const ticketId = "40818da4-a4de-46f6-a60f-1aa305093a6e"
    const ticketText = `Voir @ticket:${ticketId} ensuite`
    expect(
      applyComposerMentionKey({
        key: "Backspace",
        text: ticketText,
        cursor: `Voir @ticket:${ticketId}`.length,
      }),
    ).toEqual({
      text: "Voir  ensuite",
      cursor: 5,
    })
  })

  it("deletes a skill mention as a single chip", () => {
    expect(
      applyComposerMentionKey({
        key: "Backspace",
        text: "Use $grill now",
        cursor: 10,
        skillNames: new Set(["grill"]),
      }),
    ).toEqual({
      text: "Use  now",
      cursor: 4,
    })
  })

  it("leaves an unavailable skill token editable as text", () => {
    expect(
      applyComposerMentionKey({ key: "Backspace", text: "Use $unknown now", cursor: 12 }),
    ).toBeNull()
  })
})
