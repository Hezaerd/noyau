import { getDesktopPlatform, getHotkeysPlatform } from "@/lib/keyboard-shortcut"

export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number]

export interface CursorClientPoint {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface NoyauDesktopBridge {
  readonly platform: string
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
  readonly pickFolder: (options?: { readonly initialPath?: string }) => Promise<string | undefined>
  readonly getCursorPoint: () => Promise<CursorClientPoint | undefined>
}

interface WindowControlsOverlayLike {
  readonly visible: boolean
  addEventListener(type: "geometrychange", listener: EventListener): void
  removeEventListener(type: "geometrychange", listener: EventListener): void
}

declare global {
  interface Navigator {
    readonly windowControlsOverlay?: WindowControlsOverlayLike
  }

  interface Window {
    readonly noyauDesktop?: NoyauDesktopBridge
  }
}

export const isDesktopRuntime = (): boolean =>
  window.noyauDesktop !== undefined || /Electron/i.test(navigator.userAgent)

export const getDesktopPlatformClassNames = (platform: string): readonly string[] => {
  switch (getHotkeysPlatform(platform)) {
    case "mac":
      return ["electron", "electron-macos"]
    case "windows":
      return ["electron", "electron-windows"]
    default:
      return ["electron", "electron-linux"]
  }
}

const getWindowControlsOverlay = (): WindowControlsOverlayLike | undefined =>
  navigator.windowControlsOverlay

export const syncDocumentDesktopChrome = (): (() => void) => {
  if (!isDesktopRuntime()) {
    return () => undefined
  }

  const platformClassNames = getDesktopPlatformClassNames(getDesktopPlatform())
  const overlay = getWindowControlsOverlay()
  const syncOverlayClass = () => {
    document.documentElement.classList.toggle("wco", overlay?.visible === true)
  }

  document.documentElement.classList.add(...platformClassNames)
  syncOverlayClass()
  overlay?.addEventListener("geometrychange", syncOverlayClass)

  return () => {
    overlay?.removeEventListener("geometrychange", syncOverlayClass)
    document.documentElement.classList.remove("wco", ...platformClassNames)
  }
}
