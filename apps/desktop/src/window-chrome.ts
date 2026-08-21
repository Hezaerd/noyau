import type { BrowserWindowConstructorOptions } from "electron"

const TITLEBAR_HEIGHT = 40
const TITLEBAR_COLOR = "#01000000"
const TITLEBAR_LIGHT_SYMBOL_COLOR = "#1c1b26"
const TITLEBAR_DARK_SYMBOL_COLOR = "#f8fafc"
const WINDOW_LIGHT_BACKGROUND = "#f5f4fb"
const WINDOW_DARK_BACKGROUND = "#0f0f13"

type TitleBarOverlayOptions = Exclude<
  BrowserWindowConstructorOptions["titleBarOverlay"],
  boolean | undefined
>

export type WindowTitleBarOptions = Pick<
  BrowserWindowConstructorOptions,
  "titleBarOverlay" | "titleBarStyle" | "trafficLightPosition"
>

export const getWindowBackgroundColor = (shouldUseDarkColors: boolean): string =>
  shouldUseDarkColors ? WINDOW_DARK_BACKGROUND : WINDOW_LIGHT_BACKGROUND

export const getTitleBarOverlayOptions = (
  shouldUseDarkColors: boolean,
): TitleBarOverlayOptions => ({
  color: TITLEBAR_COLOR,
  height: TITLEBAR_HEIGHT,
  symbolColor: shouldUseDarkColors ? TITLEBAR_DARK_SYMBOL_COLOR : TITLEBAR_LIGHT_SYMBOL_COLOR,
})

export const getWindowTitleBarOptions = (
  platform: NodeJS.Platform,
  shouldUseDarkColors: boolean,
): WindowTitleBarOptions => {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      // Renderer inset: apps/web MACOS_TRAFFIC_LIGHTS_LEFT_INSET = 90px.
      trafficLightPosition: { x: 16, y: 18 },
    }
  }

  return {
    titleBarStyle: "hidden",
    titleBarOverlay: getTitleBarOverlayOptions(shouldUseDarkColors),
  }
}
