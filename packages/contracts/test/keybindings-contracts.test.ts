import { describe, expect, it } from "@effect/vitest"
import {
  decodeKeybindingsFile,
  MAX_KEYBINDINGS_COUNT,
  serializeKeybindingsFile,
} from "@noyau/contracts/keybindings"
import { Effect } from "effect"

describe("KeybindingsFile", () => {
  it("round-trips a pretty-printed overlay", () => {
    const rules = [
      { key: "mod+j", command: "palette.open" },
      { key: "mod+p", command: "palette.open", when: "settings" },
    ]
    const encoded = serializeKeybindingsFile(rules)
    expect(encoded.startsWith("[\n")).toBe(true)
    expect(Effect.runSync(decodeKeybindingsFile(encoded))).toEqual(rules)
  })

  it("tronque au-delà de 256 règles", () => {
    const rules = Array.from({ length: MAX_KEYBINDINGS_COUNT + 3 }, (_, index) => ({
      key: `mod+${String(index)}`,
      command: "palette.open",
    }))
    expect(Effect.runSync(decodeKeybindingsFile(JSON.stringify(rules)))).toHaveLength(
      MAX_KEYBINDINGS_COUNT,
    )
  })
})
