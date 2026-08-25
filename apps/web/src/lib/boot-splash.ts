import { parseReleaseChannel, type ReleaseChannel } from "@noyau/shared/release-brand"

export const BOOT_SPLASH_ELEMENT_ID = "noyau-boot-splash"
export const BOOT_SPLASH_MARK_ID = "noyau-boot-splash-mark"
export const BOOT_SPLASH_CHANNEL_PARAM = "channel"
export const BOOT_SPLASH_SIZE = 96
export const BOOT_SPLASH_LIGHT_BACKGROUND = "#f5f4fb"
export const BOOT_SPLASH_DARK_BACKGROUND = "#0f0f13"

export const resolveBootSplashChannel = (raw: string | null | undefined): ReleaseChannel =>
  parseReleaseChannel(raw ?? undefined) ?? "latest"

/**
 * Preload first: `validateSearch` du Tableau retire `channel` de l'URL après
 * le premier navigate, donc un reload ne peut pas se fier au query.
 */
export const resolveBootSplashChannelFromBoot = (input: {
  readonly desktopChannel?: string
  readonly search: string
}): ReleaseChannel => {
  const fromDesktop = parseReleaseChannel(input.desktopChannel)
  if (fromDesktop !== undefined) {
    return fromDesktop
  }
  return resolveBootSplashChannel(new URLSearchParams(input.search).get("channel"))
}

export const bootSplashAssetPath = (channel: ReleaseChannel): string =>
  `/boot-splash-${channel}.svg`

export const dismissBootSplash = (): void => {
  const splash = document.getElementById(BOOT_SPLASH_ELEMENT_ID)
  if (splash === null) {
    return
  }
  splash.setAttribute("hidden", "")
}
