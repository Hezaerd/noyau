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
