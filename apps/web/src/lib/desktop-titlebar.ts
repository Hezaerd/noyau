import type { CSSProperties } from "react"

import { isDesktopRuntime } from "@/lib/desktop-bridge"
import { getHotkeysPlatform } from "@/lib/keyboard-shortcut"

/**
 * Space reserved for Electron `hiddenInset` traffic lights.
 * Matches `trafficLightPosition.x = 16` plus the 12×3 / 8×2 light group.
 */
export const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "90px"

export const SIDEBAR_TITLEBAR_INSET_CLASS = "pl-[var(--desktop-titlebar-content-left)]"

export const COLLAPSED_PAGE_TITLEBAR_INSET_CLASS =
  "[[data-sidebar-state=collapsed]_&]:pl-[var(--desktop-titlebar-content-left)]"

export const NARROW_PAGE_TITLEBAR_INSET_CLASS = "max-sm:pl-[var(--desktop-titlebar-content-left)]"

export const isMacosDesktop = (): boolean => isDesktopRuntime() && getHotkeysPlatform() === "mac"

type DesktopChromeStyle = CSSProperties & {
  "--desktop-controls-left"?: string
}

export const macosDesktopControlsStyle = (): DesktopChromeStyle => {
  if (!isMacosDesktop()) {
    return {}
  }

  return {
    "--desktop-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET,
  }
}
