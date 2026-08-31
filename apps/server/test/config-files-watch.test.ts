import { describe, expect, it } from "@effect/vitest"
import { configFileKindFromPath } from "@noyau/server/config-files-watch"

const basename = (value: string): string => value.split("/").at(-1) ?? value

describe("configFileKindFromPath", () => {
  it("reconnaît settings et keybindings, ignore les tmp", () => {
    expect(configFileKindFromPath("/tmp/home/settings.json", basename)).toBe("settings")
    expect(configFileKindFromPath("/tmp/home/keybindings.json", basename)).toBe("keybindings")
    expect(configFileKindFromPath("/tmp/home/keybindings.json.tmp", basename)).toBeUndefined()
    expect(configFileKindFromPath("/tmp/home/noyau.sqlite", basename)).toBeUndefined()
  })
})
