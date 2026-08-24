import {
  DEFAULT_RELEASE_CHANNEL,
  releaseBrand,
  type ReleaseChannel,
} from "@noyau/shared/release-brand"

import { getDesktopPlatform, getHotkeysPlatform } from "@/lib/keyboard-shortcut"

export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number]

export interface CursorClientPoint {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type DesktopReleaseChannel = ReleaseChannel

export type DesktopUpdatePackagedChannel = "latest" | "nightly"

export type DesktopUpdateCheckResult =
  | { readonly _tag: "unsupported"; readonly currentVersion: string }
  | {
      readonly _tag: "current"
      readonly currentVersion: string
      readonly channel: DesktopUpdatePackagedChannel
    }
  | {
      readonly _tag: "available"
      readonly currentVersion: string
      readonly availableVersion: string
      readonly installerName: string
      readonly installerUrl: string
      readonly releaseUrl: string
      readonly channel: DesktopUpdatePackagedChannel
    }
  | {
      readonly _tag: "missing"
      readonly currentVersion: string
      readonly channel: DesktopUpdatePackagedChannel
      readonly reason: "no-release" | "no-installer"
    }
  | { readonly _tag: "failed"; readonly currentVersion: string; readonly message: string }

export type DesktopUpdateOpenResult =
  | { readonly _tag: "opened" }
  | {
      readonly _tag: "unavailable"
      readonly reason: "unsupported" | "current" | "missing" | "failed"
      readonly message?: string
    }
  | { readonly _tag: "failed"; readonly message: string }

export interface NoyauDesktopBridge {
  readonly platform: string
  readonly releaseChannel?: DesktopReleaseChannel
  readonly appVersion?: string
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
  readonly pickFolder: (options?: { readonly initialPath?: string }) => Promise<string | undefined>
  readonly openPath: (path: string) => Promise<void>
  readonly getCursorPoint: () => Promise<CursorClientPoint | undefined>
  readonly checkDesktopUpdate?: (
    channel?: DesktopUpdatePackagedChannel,
  ) => Promise<DesktopUpdateCheckResult>
  readonly openDesktopInstaller?: (
    channel?: DesktopUpdatePackagedChannel,
  ) => Promise<DesktopUpdateOpenResult>
}

export const desktopReleaseChannel = (): DesktopReleaseChannel =>
  window.noyauDesktop?.releaseChannel ?? DEFAULT_RELEASE_CHANNEL

export const desktopAppVersion = (): string => window.noyauDesktop?.appVersion ?? ""

export const desktopBrandName = (
  channel: DesktopReleaseChannel = desktopReleaseChannel(),
): string => releaseBrand(channel).displayName

export const desktopChannelHint = (
  channel: DesktopReleaseChannel = desktopReleaseChannel(),
): "dev" | "nightly" | undefined => {
  switch (channel) {
    case "development":
      return "dev"
    case "nightly":
      return "nightly"
    case "latest":
      return undefined
  }
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
  document.documentElement.dataset.releaseChannel = desktopReleaseChannel()
  syncOverlayClass()
  overlay?.addEventListener("geometrychange", syncOverlayClass)

  return () => {
    overlay?.removeEventListener("geometrychange", syncOverlayClass)
    document.documentElement.classList.remove("wco", ...platformClassNames)
    delete document.documentElement.dataset.releaseChannel
  }
}
