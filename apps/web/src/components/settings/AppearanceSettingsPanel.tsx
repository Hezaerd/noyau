import { useId, type ReactElement } from "react"

import { SettingsPage, SettingsRow, SettingsSection } from "@/components/settings/settings-layout"
import { NOYAU_THEME_PREVIEW_COLORS, ThemeWireframe } from "@/components/settings/theme-wireframe"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppearance } from "@/hooks/use-appearance"
import { useTranscriptPaintMode } from "@/hooks/use-transcript-paint-preference"
import type { AppearancePreference } from "@/lib/desktop-bridge"
import { isTranscriptPaintMode, TRANSCRIPT_PAINT_ITEMS } from "@/lib/transcript-paint-preference"
import { cn } from "@/lib/utils"
import { setTranscriptPaintMode } from "@/state/preferences"

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
  const transcriptPaint = useTranscriptPaintMode()
  const transcriptPaintSelectId = useId()

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
        <SettingsRow
          id="transcript-paint"
          title="Transcript paint"
          description="Smooth paints the live bubble at the display rate. Immediate applies each hint right away."
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
                aria-label="Transcript paint"
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
