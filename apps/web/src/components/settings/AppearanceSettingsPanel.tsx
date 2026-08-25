import { useId, type ReactElement } from "react"

import { SettingsPage, SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import { NOYAU_THEME_PREVIEW_COLORS, ThemeWireframe } from "@/components/settings/theme-wireframe"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppearance } from "@/hooks/use-appearance"
import { useTranscriptPaintMode } from "@/hooks/use-transcript-paint-preference"
import type { AppearancePreference } from "@/lib/desktop-bridge"
import {
  isTranscriptPaintMode,
  setTranscriptPaintMode,
  TRANSCRIPT_PAINT_ITEMS,
} from "@/lib/transcript-paint-preference"
import { cn } from "@/lib/utils"

const appearanceModes: ReadonlyArray<{
  readonly value: AppearancePreference
  readonly label: string
  readonly ariaLabel: string
}> = [
  { value: "system", label: "Système", ariaLabel: "Suivre l’apparence du système" },
  { value: "light", label: "Clair", ariaLabel: "Utiliser le thème clair" },
  { value: "dark", label: "Sombre", ariaLabel: "Utiliser le thème sombre" },
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
  const transcriptPaint = useTranscriptPaintMode()
  const transcriptPaintSelectId = useId()

  return (
    <SettingsPage>
      <SettingsSection id="appearance" title="Apparence">
        <div className="flex flex-col gap-3">
          <p className="px-3 text-[13px] leading-[1.45] text-muted-foreground/80 sm:px-4">
            Choisis comment Noyau s’affiche.
          </p>
          <h3 className="px-3 text-sm font-medium tracking-[-0.005em] text-foreground sm:px-4">
            Thème
          </h3>
          <div
            aria-label="Thème"
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
        <SettingsRow
          id="transcript-paint"
          title="Peinture du transcript"
          description="Fluide peint la bulle live au rythme de l’écran. Immédiat applique chaque hint tout de suite."
          control={
            <Select
              items={TRANSCRIPT_PAINT_ITEMS}
              value={transcriptPaint}
              onValueChange={(next) => {
                if (next !== null && isTranscriptPaintMode(next)) {
                  setTranscriptPaintMode(next)
                }
              }}
            >
              <SelectTrigger
                id={transcriptPaintSelectId}
                size="sm"
                className="w-full sm:w-52"
                aria-label="Peinture du transcript"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {TRANSCRIPT_PAINT_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPage>
  )
}

export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = "system"
