import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs"

export const DIFF_THEME_NAMES = {
  light: "pierre-light",
  dark: "pierre-dark",
} as const

export type DiffThemeName = (typeof DIFF_THEME_NAMES)[keyof typeof DIFF_THEME_NAMES]

export const resolveDiffThemeName = (theme: "light" | "dark"): DiffThemeName =>
  theme === "dark" ? DIFF_THEME_NAMES.dark : DIFF_THEME_NAMES.light

export const parseTurnDiffPatch = (patch: string): ReadonlyArray<FileDiffMetadata> => {
  const trimmed = patch.trim()
  if (trimmed.length === 0) {
    return []
  }
  try {
    return parsePatchFiles(trimmed).flatMap((parsed) => parsed.files)
  } catch {
    return []
  }
}

export const fileDiffPath = (file: FileDiffMetadata): string => {
  const raw = file.name ?? file.prevName ?? ""
  return raw.startsWith("a/") || raw.startsWith("b/") ? raw.slice(2) : raw
}
