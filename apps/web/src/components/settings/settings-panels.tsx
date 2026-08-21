import type { ComponentType } from "react"

import { AppearanceSettingsPanel } from "@/components/settings/AppearanceSettingsPanel"
import { GeneralSettingsPanel } from "@/components/settings/GeneralSettingsPanel"
import { KeybindingsSettingsPanel } from "@/components/settings/KeybindingsSettingsPanel"
import { ProvidersSettingsPanel } from "@/components/settings/ProvidersSettingsPanel"
import type { SettingsTabId } from "@/lib/settings-catalog"

export const SETTINGS_PANELS = {
  general: GeneralSettingsPanel,
  appearance: AppearanceSettingsPanel,
  providers: ProvidersSettingsPanel,
  keybindings: KeybindingsSettingsPanel,
} as const satisfies Record<SettingsTabId, ComponentType>
