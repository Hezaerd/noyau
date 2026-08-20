import { describe, expect, it } from "vite-plus/test"

import {
  DEFAULT_SETTINGS_TAB,
  parseSettingsTabId,
  searchSettings,
  SETTINGS_ITEMS,
  SETTINGS_TAB_IDS,
  SETTINGS_TABS,
} from "../src/lib/settings-catalog"

describe("settings catalog", () => {
  it("keeps every catalog item on a declared tab", () => {
    const tabIds = new Set(SETTINGS_TABS.map((tab) => tab.id))
    expect([...tabIds]).toEqual([...SETTINGS_TAB_IDS])
    for (const item of SETTINGS_ITEMS) {
      expect(tabIds.has(item.tab)).toBe(true)
    }
  })

  it("falls back to the default tab for an unknown segment", () => {
    expect(parseSettingsTabId("appearance")).toBe("appearance")
    expect(parseSettingsTabId("keybindings")).toBe("keybindings")
    expect(parseSettingsTabId("unknown")).toBe(DEFAULT_SETTINGS_TAB)
  })

  it("searches titles and keywords without accents", () => {
    expect(searchSettings("theme").map((hit) => hit.id)).toEqual(["appearance"])
    expect(searchSettings("sombre").map((hit) => hit.tab.id)).toEqual(["appearance"])
    expect(searchSettings("")).toEqual([])
    expect(searchSettings("cursor")).toEqual([])
    expect(searchSettings("palette").map((hit) => hit.tab.id)).toEqual(["keybindings"])
  })
})
