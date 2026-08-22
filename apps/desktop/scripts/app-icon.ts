import { RELEASE_BRANDS, type ReleaseChannel } from "@noyau/shared/release-brand"

import type { DesktopReleaseChannel } from "./release-version.ts"

export const APP_ICON_NAME = "noyau"
export const APP_ICON_SIZE = 1024
export const MAC_BUNDLE_ICON_FILE = "icon.icns"
export const MAC_BUNDLE_STOCK_ICON_FILE = "electron.icns"

export const APP_ICON_VARIANTS = {
  development: {
    appearance: RELEASE_BRANDS.development.appearance,
    directory: RELEASE_BRANDS.development.iconDirectory,
    palette: {
      bg: RELEASE_BRANDS.development.palette.background,
      head: RELEASE_BRANDS.development.palette.head,
      eye: RELEASE_BRANDS.development.palette.eye,
    },
  },
  production: {
    appearance: RELEASE_BRANDS.latest.appearance,
    directory: RELEASE_BRANDS.latest.iconDirectory,
    palette: {
      bg: RELEASE_BRANDS.latest.palette.background,
      head: RELEASE_BRANDS.latest.palette.head,
      eye: RELEASE_BRANDS.latest.palette.eye,
    },
  },
  nightly: {
    appearance: RELEASE_BRANDS.nightly.appearance,
    directory: RELEASE_BRANDS.nightly.iconDirectory,
    palette: {
      bg: RELEASE_BRANDS.nightly.palette.background,
      head: RELEASE_BRANDS.nightly.palette.head,
      eye: RELEASE_BRANDS.nightly.palette.eye,
    },
  },
} as const

export type AppIconVariant = keyof typeof APP_ICON_VARIANTS

export const resolveAppIconVariant = (channel: ReleaseChannel): AppIconVariant => {
  if (channel === "development") {
    return "development"
  }
  if (channel === "nightly") {
    return "nightly"
  }
  return "production"
}

export const resolveAppIconDirectory = (
  desktopDirectory: string,
  variant: AppIconVariant,
): string => `${desktopDirectory}/assets/${APP_ICON_VARIANTS[variant].directory}`

export const resolveAppIconPath = (
  desktopDirectory: string,
  channel: DesktopReleaseChannel,
): string =>
  `${resolveAppIconDirectory(desktopDirectory, resolveAppIconVariant(channel))}/app-icon.icns`

export const resolveAppIconPngPath = (
  desktopDirectory: string,
  channel: DesktopReleaseChannel,
): string =>
  `${resolveAppIconDirectory(desktopDirectory, resolveAppIconVariant(channel))}/app-icon.png`

export const resolveMacBundleIconPath = (appBundlePath: string): string =>
  `${appBundlePath}/Contents/Resources/${MAC_BUNDLE_ICON_FILE}`

export const resolveMacBundleStockIconPath = (appBundlePath: string): string =>
  `${appBundlePath}/Contents/Resources/${MAC_BUNDLE_STOCK_ICON_FILE}`
