import type { ComponentType } from "react"

import { AppearanceSettingsPanel } from "@/components/settings/AppearanceSettingsPanel"
import { KeybindingsSettingsPanel } from "@/components/settings/KeybindingsSettingsPanel"
import type { SettingsTabId } from "@/lib/settings-catalog"

export const SETTINGS_PANELS = {
  appearance: AppearanceSettingsPanel,
  keybindings: KeybindingsSettingsPanel,
} as const satisfies Record<SettingsTabId, ComponentType>
