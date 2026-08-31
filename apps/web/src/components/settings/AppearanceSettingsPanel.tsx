import type { ReactElement } from "react"

import { SettingsPage, SettingsSection } from "@/components/settings/settings-layout"
import { NOYAU_THEME_PREVIEW_COLORS, ThemeWireframe } from "@/components/settings/theme-wireframe"
import { useAppearance } from "@/hooks/use-appearance"
import type { AppearancePreference } from "@/lib/desktop-bridge"
import { cn } from "@/lib/utils"

const appearanceModes: ReadonlyArray<{
  readonly value: AppearancePreference
  readonly label: string
  readonly ariaLabel: string
}> = [
  { value: "system", label: "System", ariaLabel: "Follow system appearance" },
  { value: "light", label: "Light", ariaLabel: "Use the light theme" },
  { value: "dark", label: "Dark", ariaLabel: "Use the dark theme" },
]

const renderWireframe = (mode: AppearancePreference) => (
  <ThemeWireframe
    className="h-[8.75rem]"
    panes={
      mode === "system"
        ? [
            { clip: "left", colors: NOYAU_THEME_PREVIEW_COLORS.light },
            { clip: "right", colors: NOYAU_THEME_PREVIEW_COLORS.dark },
          ]
        : [{ colors: NOYAU_THEME_PREVIEW_COLORS[mode] }]
    }
  />
)

export function AppearanceSettingsPanel(): ReactElement {
  const { preference, setPreference } = useAppearance()

  return (
    <SettingsPage>
      <SettingsSection id="appearance" title="Appearance">
        <div className="flex flex-col gap-3">
          <p className="px-3 text-[13px] leading-[1.45] text-muted-foreground/80 sm:px-4">
            Choose how Noyau looks.
          </p>
          <h3 className="px-3 text-sm font-medium tracking-[-0.005em] text-foreground sm:px-4">
            Theme
          </h3>
          <div
            aria-label="Theme"
            className="grid w-full grid-cols-3 gap-3 px-3 sm:px-4"
            role="group"
          >
            {appearanceModes.map(({ value, label, ariaLabel }) => {
              const isActive = preference === value
              return (
                <button
                  aria-label={ariaLabel}
                  aria-pressed={isActive}
                  className={cn(
                    "flex cursor-pointer flex-col items-stretch gap-1.5 rounded-xl border p-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "border-transparent bg-accent/30"
                      : "border-border/70 bg-card/60 hover:bg-accent/10",
                  )}
                  key={value}
                  style={isActive ? { boxShadow: "inset 0 0 0 1px var(--ring)" } : undefined}
                  type="button"
                  onClick={() => setPreference(value)}
                >
                  {renderWireframe(value)}
                  <span
                    className={cn(
                      "flex items-center justify-center text-xs font-medium",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </SettingsSection>
    </SettingsPage>
  )
}

export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = "system"
