import { MonitorIcon, MoonIcon, SettingsIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu"
import { useAppearance } from "@/hooks/use-appearance"
import { parseAppearancePreference } from "@/lib/appearance"

const appearanceItems = [
  { value: "system", label: "Système", Icon: MonitorIcon },
  { value: "light", label: "Clair", Icon: SunIcon },
  { value: "dark", label: "Sombre", Icon: MoonIcon },
] as const

export function AppearanceMenu() {
  const { preference, setPreference } = useAppearance()

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Paramètres d’apparence"
            className="text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <SettingsIcon />
          </Button>
        }
      />
      <MenuPopup align="start" side="top" className="w-44">
        <MenuGroup>
          <MenuGroupLabel>Apparence</MenuGroupLabel>
          <MenuRadioGroup
            value={preference}
            onValueChange={(value) => {
              setPreference(parseAppearancePreference(value))
            }}
          >
            {appearanceItems.map(({ value, label, Icon }) => (
              <MenuRadioItem key={value} value={value}>
                <span className="flex items-center gap-2">
                  <Icon />
                  {label}
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  )
}
