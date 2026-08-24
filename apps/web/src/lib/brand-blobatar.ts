import { releaseBrand } from "@noyau/shared/release-brand"

import type { DesktopReleaseChannel } from "@/lib/desktop-bridge"

export const BRAND_BLOBATAR_NAME = "noyau"

/**
 * Fixed per channel — same slots as the desktop app icon (`bg` / `head` / `eye`).
 * Does not follow the UI theme. Without `bg`, nightly’s dark head vanishes on a dark sidebar.
 */
export const brandBlobatarPalette = (channel: DesktopReleaseChannel = "latest") => {
  const { background, head, eye } = releaseBrand(channel).palette
  return { bg: background, head, eye }
}
