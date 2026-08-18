import { formatForDisplay, parseHotkey } from "@tanstack/react-hotkeys"

export const HOTKEY_COMMAND_PALETTE = "Mod+K" as const

export type HotkeysPlatform = "mac" | "windows" | "linux"

export const getDesktopPlatform = (): string => window.noyauDesktop?.platform ?? navigator.platform

export const getHotkeysPlatform = (platform = getDesktopPlatform()): HotkeysPlatform => {
  if (platform.startsWith("Mac")) {
    return "mac"
  }
  if (platform.startsWith("Win")) {
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
