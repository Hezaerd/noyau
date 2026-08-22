import type { DesktopReleaseChannel } from "./release-version.ts"

export const APP_ICON_NAME = "noyau"
export const APP_ICON_SIZE = 1024
export const MAC_BUNDLE_ICON_FILE = "icon.icns"
export const MAC_BUNDLE_STOCK_ICON_FILE = "electron.icns"

export const APP_ICON_VARIANTS = {
  development: {
    appearance: "dark",
    directory: "dev",
    palette: {
      bg: "#1a1208",
      head: "#c45c26",
      eye: "#ffe7c2",
    },
  },
  production: {
    appearance: "light",
    directory: "prod",
    palette: {
      bg: "#ebe9f4",
      head: "#6154e0",
      eye: "#f7f5ff",
    },
  },
  nightly: {
    appearance: "dark",
    directory: "nightly",
    palette: {
      bg: "#0a0a0e",
      head: "#302b4b",
      eye: "#e2ddff",
    },
  },
} as const

export type AppIconVariant = keyof typeof APP_ICON_VARIANTS

export const resolveAppIconVariant = (channel: DesktopReleaseChannel): AppIconVariant => {
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
