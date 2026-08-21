import { describe, expect, it } from "vite-plus/test"

import {
  DEFAULT_SETTINGS_TAB,
  isSettingsPath,
  parseSettingsTabId,
  resolveSettingsTabFromPathname,
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

  it("recognizes Paramètres routes without matching neighboring paths", () => {
    expect(isSettingsPath("/settings")).toBe(true)
    expect(isSettingsPath("/settings/general")).toBe(true)
    expect(isSettingsPath("/settings/appearance")).toBe(true)
    expect(isSettingsPath("/settings/providers")).toBe(true)
    expect(isSettingsPath("/settings/keybindings")).toBe(true)
    expect(isSettingsPath("/")).toBe(false)
    expect(isSettingsPath("/settings-room")).toBe(false)
  })

  it("falls back to the default tab for an unknown segment", () => {
    expect(parseSettingsTabId("appearance")).toBe("appearance")
    expect(parseSettingsTabId("general")).toBe("general")
    expect(parseSettingsTabId("providers")).toBe("providers")
    expect(parseSettingsTabId("keybindings")).toBe("keybindings")
    expect(parseSettingsTabId("unknown")).toBe(DEFAULT_SETTINGS_TAB)
  })

  it("resolves the tab from a Paramètres pathname", () => {
    expect(resolveSettingsTabFromPathname("/settings").id).toBe(DEFAULT_SETTINGS_TAB)
    expect(resolveSettingsTabFromPathname("/settings/general").id).toBe("general")
    expect(resolveSettingsTabFromPathname("/settings/appearance").id).toBe("appearance")
    expect(resolveSettingsTabFromPathname("/settings/providers").id).toBe("providers")
    expect(resolveSettingsTabFromPathname("/settings/keybindings").id).toBe("keybindings")
    expect(resolveSettingsTabFromPathname("/settings/unknown").id).toBe(DEFAULT_SETTINGS_TAB)
  })

  it("searches titles and keywords without accents", () => {
    expect(searchSettings("dossier").map((hit) => hit.id)).toEqual([
      "project-folder-start-directory",
    ])
    expect(searchSettings("theme").map((hit) => hit.id)).toEqual(["appearance"])
    expect(searchSettings("sombre").map((hit) => hit.tab.id)).toEqual(["appearance"])
    expect(searchSettings("")).toEqual([])
    expect(searchSettings("cursor").map((hit) => hit.id)).toEqual(["providers", "provider-cursor"])
    expect(searchSettings("claude").map((hit) => hit.id)).toEqual([
      "providers",
      "provider-claude-code",
    ])
    expect(searchSettings("palette").map((hit) => hit.tab.id)).toEqual(["keybindings"])
  })
})
