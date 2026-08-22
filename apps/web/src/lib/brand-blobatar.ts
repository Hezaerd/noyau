import type { DesktopReleaseChannel } from "@/lib/desktop-bridge"

export const BRAND_BLOBATAR_NAME = "noyau"

/** Fixed per channel. Does not follow the UI theme. Desktop icons reuse head/eye. */
const LIGHT_BLOBATAR_PALETTE = { head: "#6154e0", eye: "#f7f5ff" } as const
const DARK_BLOBATAR_PALETTE = { head: "#302b4b", eye: "#e2ddff" } as const
const EMBER_BLOBATAR_PALETTE = { head: "#c45c26", eye: "#ffe7c2" } as const

export const brandBlobatarPalette = (channel: DesktopReleaseChannel = "latest") => {
  if (channel === "development") {
    return EMBER_BLOBATAR_PALETTE
  }
  if (channel === "nightly") {
    return DARK_BLOBATAR_PALETTE
  }
  return LIGHT_BLOBATAR_PALETTE
}
