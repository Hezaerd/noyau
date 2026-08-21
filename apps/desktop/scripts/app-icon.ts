export const APP_ICON_NAME = "noyau"
export const APP_ICON_SIZE = 1024
export const MAC_BUNDLE_ICON_RELATIVE_PATH = "Contents/Resources/electron.icns"

export const APP_ICON_VARIANTS = {
  development: {
    appearance: "light",
    directory: "dev",
    palette: {
      bg: "#ebe9f4",
      head: "#6154e0",
      eye: "#f7f5ff",
    },
  },
  production: {
    appearance: "dark",
    directory: "prod",
    palette: {
      bg: "#0a0a0e",
      head: "#302b4b",
      eye: "#e2ddff",
    },
  },
} as const

export type AppIconVariant = keyof typeof APP_ICON_VARIANTS

export const resolveAppIconVariant = (isDevelopment: boolean): AppIconVariant =>
  isDevelopment ? "development" : "production"

export const resolveAppIconDirectory = (
  desktopDirectory: string,
  variant: AppIconVariant,
): string => `${desktopDirectory}/assets/${APP_ICON_VARIANTS[variant].directory}`

export const resolveAppIconPath = (desktopDirectory: string, isDevelopment: boolean): string =>
  `${resolveAppIconDirectory(desktopDirectory, resolveAppIconVariant(isDevelopment))}/app-icon.icns`

export const resolveMacBundleIconPath = (appBundlePath: string): string =>
  `${appBundlePath}/${MAC_BUNDLE_ICON_RELATIVE_PATH}`
