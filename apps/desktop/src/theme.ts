export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number]

export const SET_THEME_CHANNEL = "noyau:desktop:set-theme"
