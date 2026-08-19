import { formatForDisplay, parseHotkey } from "@tanstack/react-hotkeys"

export const HOTKEY_COMMAND_PALETTE = "Mod+K" as const

export type HotkeysPlatform = "mac" | "windows" | "linux"

declare global {
  interface Navigator {
    readonly userAgentData?: {
      readonly platform?: string
    }
  }
}

const getBrowserPlatformHint = (): string => {
  const userAgentPlatform = navigator.userAgentData?.platform
  if (userAgentPlatform !== undefined && userAgentPlatform.length > 0) {
    return userAgentPlatform
  }
  if (navigator.platform.length > 0) {
    return navigator.platform
  }
  return navigator.userAgent
}

export const getDesktopPlatform = (): string =>
  window.noyauDesktop?.platform ?? getBrowserPlatformHint()

export const getHotkeysPlatform = (platform = getDesktopPlatform()): HotkeysPlatform => {
  const normalized = platform.toLowerCase()
  if (
    normalized === "darwin" ||
    normalized.includes("mac") ||
    normalized.includes("iphone") ||
    normalized.includes("ipad") ||
    normalized.includes("ipod")
  ) {
    return "mac"
  }
  if (normalized === "win32" || normalized.includes("win")) {
    return "windows"
  }
  return "linux"
}

export const paletteItemHotkey = (index: number, platform = getHotkeysPlatform()): string => {
  const key = String(index + 1)
  return platform === "mac" ? `Mod+${key}` : `Alt+${key}`
}

export const paletteItemModifierPressed = (
  event: Pick<KeyboardEvent, "metaKey" | "altKey">,
  platform = getHotkeysPlatform(),
): boolean => (platform === "mac" ? event.metaKey : event.altKey)

export const getShortcutSegments = (
  hotkey: string,
  platform = getHotkeysPlatform(getDesktopPlatform()),
): readonly string[] => {
  const parsed = parseHotkey(hotkey, platform)
  const segments: string[] = []

  for (const modifier of parsed.modifiers) {
    segments.push(formatForDisplay(modifier, { platform }))
  }

  segments.push(formatForDisplay(parsed.key, { platform }))
  return segments
}
