import type { ResolvedAppearance } from "@/lib/appearance"
import type { DesktopReleaseChannel } from "@/lib/desktop-bridge"

export const BRAND_BLOBATAR_NAME = "noyau"

/** Theme tokens from `coss-color-tokens.css`. Desktop icons reuse head/eye. */
const BRAND_BLOBATAR_PALETTE = {
  light: { head: "#6154e0", eye: "#f7f5ff" },
  dark: { head: "#302b4b", eye: "#e2ddff" },
} as const

const NIGHTLY_BLOBATAR_PALETTE = {
  light: { head: "#c45c26", eye: "#fff4e5" },
  dark: { head: "#e08a3c", eye: "#ffe7c2" },
} as const

export const brandBlobatarPalette = (
  appearance: ResolvedAppearance,
  channel: DesktopReleaseChannel = "latest",
) =>
  channel === "nightly" ? NIGHTLY_BLOBATAR_PALETTE[appearance] : BRAND_BLOBATAR_PALETTE[appearance]
