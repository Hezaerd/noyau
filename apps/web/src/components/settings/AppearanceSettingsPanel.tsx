import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import type { ReactElement } from "react"

import { SettingsPage, SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import {
  Select,
  SelectGroup,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAppearance } from "@/hooks/use-appearance"
import { parseAppearancePreference } from "@/lib/appearance"
import type { AppearancePreference } from "@/lib/desktop-bridge"

const appearanceItems: ReadonlyArray<{
  readonly value: AppearancePreference
  readonly label: string
  readonly Icon: typeof MonitorIcon
}> = [
  { value: "system", label: "Système", Icon: MonitorIcon },
  { value: "light", label: "Clair", Icon: SunIcon },
  { value: "dark", label: "Sombre", Icon: MoonIcon },
]

export function AppearanceSettingsPanel(): ReactElement {
  const { preference, setPreference } = useAppearance()
  const selectedLabel =
    appearanceItems.find((item) => item.value === preference)?.label ?? preference

  return (
    <SettingsPage>
      <SettingsSection title="Apparence">
        <SettingsRow
          id="appearance"
          title="Apparence"
          description="Thème de l’interface : système, clair ou sombre."
          control={
            <Select
              items={appearanceItems}
              value={preference}
              onValueChange={(next) => {
                if (next !== null) {
                  setPreference(parseAppearancePreference(next))
                }
              }}
            >
              <SelectTrigger size="sm" aria-label="Apparence" className="w-44">
                <SelectValue>{selectedLabel}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectGroup>
                  {appearanceItems.map(({ value, label, Icon }) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <Icon />
                        {label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPage>
  )
}

export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = "system"
