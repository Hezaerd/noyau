import type { ComponentType } from "react"

import { AppearanceSettingsPanel } from "@/components/settings/AppearanceSettingsPanel"
import { KeybindingsSettingsPanel } from "@/components/settings/KeybindingsSettingsPanel"
import { useAppearance } from "@/hooks/use-appearance"
import { useKeybindings } from "@/hooks/use-keybindings"
import { setAppearancePreference } from "@/lib/appearance"
import { hasCustomKeybindings } from "@/lib/keybindings"
import type { SettingsTabId } from "@/lib/settings-catalog"

import { DEFAULT_APPEARANCE_PREFERENCE } from "./AppearanceSettingsPanel"

export const SETTINGS_PANELS = {
  appearance: AppearanceSettingsPanel,
  keybindings: KeybindingsSettingsPanel,
} as const satisfies Record<SettingsTabId, ComponentType>

export interface SettingsTabRestore {
  readonly canRestore: boolean
  readonly restore: () => void
}

export const useSettingsTabRestore = (tabId: SettingsTabId): SettingsTabRestore => {
  const { preference } = useAppearance()
  const { resetAll } = useKeybindings()

  switch (tabId) {
    case "appearance":
      return {
        canRestore: preference !== DEFAULT_APPEARANCE_PREFERENCE,
        restore: () => setAppearancePreference(DEFAULT_APPEARANCE_PREFERENCE),
      }
    case "keybindings":
      return {
        canRestore: hasCustomKeybindings(),
        restore: resetAll,
      }
  }
}
