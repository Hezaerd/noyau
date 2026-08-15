export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number]

export interface NoyauDesktopBridge {
  readonly platform: string
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
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

export const getDesktopPlatformClassNames = (platform: string): readonly string[] => {
  if (platform.startsWith("Mac")) {
    return ["electron", "electron-macos"]
  }
  if (platform.startsWith("Win")) {
    return ["electron", "electron-windows"]
  }
  return ["electron", "electron-linux"]
}

const getWindowControlsOverlay = (): WindowControlsOverlayLike | undefined =>
  navigator.windowControlsOverlay

export const syncDocumentDesktopChrome = (): (() => void) => {
  if (window.noyauDesktop === undefined) {
    return () => undefined
  }

  const platformClassNames = getDesktopPlatformClassNames(navigator.platform)
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
