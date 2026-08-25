import { Option, Schema } from "effect"

import { APPEARANCE_PREFERENCES, type AppearancePreference } from "@/lib/desktop-bridge"

export type ResolvedAppearance = Exclude<AppearancePreference, "system">

const APPEARANCE_STORAGE_KEY = "noyau:appearance"
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)"
const NO_TRANSITIONS_CLASS_NAME = "no-theme-transitions"
const AppearancePreferenceSchema = Schema.Literals(APPEARANCE_PREFERENCES)
const decodeAppearancePreference = Schema.decodeUnknownOption(AppearancePreferenceSchema)

export const parseAppearancePreference = (value: string | null): AppearancePreference =>
  Option.getOrElse(decodeAppearancePreference(value), () => "system")

export const resolveAppearance = (
  preference: AppearancePreference,
  systemUsesDarkColors: boolean,
): ResolvedAppearance =>
  preference === "system" ? (systemUsesDarkColors ? "dark" : "light") : preference

export const readStoredAppearancePreference = (): AppearancePreference => {
  try {
    return parseAppearancePreference(window.localStorage.getItem(APPEARANCE_STORAGE_KEY))
  } catch {
    return "system"
  }
}

export const persistAppearancePreference = (preference: AppearancePreference): void => {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, preference)
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}

const suppressThemeTransitions = (): void => {
  document.documentElement.classList.add(NO_TRANSITIONS_CLASS_NAME)
  requestAnimationFrame(() => {
    document.documentElement.classList.remove(NO_TRANSITIONS_CLASS_NAME)
  })
}

const syncDesktopTheme = (preference: AppearancePreference): void => {
  const bridge = window.noyauDesktop
  if (bridge === undefined) {
    return
  }

  void bridge
    .setTheme(preference)
    .then(() => {
      delete document.documentElement.dataset.desktopThemeSync
      return undefined
    })
    .catch(() => {
      document.documentElement.dataset.desktopThemeSync = "failed"
    })
}

export const applyAppearance = (
  preference: AppearancePreference,
  suppressTransitions: boolean,
): void => {
  if (suppressTransitions) {
    suppressThemeTransitions()
  }

  const systemUsesDarkColors = window.matchMedia(SYSTEM_DARK_QUERY).matches
  const resolvedAppearance = resolveAppearance(preference, systemUsesDarkColors)
  document.documentElement.classList.toggle("dark", resolvedAppearance === "dark")
  document.documentElement.style.colorScheme = resolvedAppearance
  syncDesktopTheme(preference)
}

export const watchSystemAppearance = (onChange: () => void): void => {
  window.matchMedia(SYSTEM_DARK_QUERY).addEventListener("change", onChange)
}
