import type { ResolvedAppearance } from "@/lib/appearance"

export const BRAND_BLOBATAR_NAME = "noyau"

/** Exact theme tokens from `coss-color-tokens.css`. */
const BRAND_BLOBATAR_PALETTE = {
  light: { head: "#6154e0", eye: "#f7f5ff" },
  dark: { head: "#302b4b", eye: "#e2ddff" },
} as const

export const brandBlobatarPalette = (appearance: ResolvedAppearance) =>
  BRAND_BLOBATAR_PALETTE[appearance]
