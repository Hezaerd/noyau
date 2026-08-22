import type { EditorId } from "@noyau/protocol/editor"

const PREFERRED_EDITOR_STORAGE_KEY = "noyau:preferred-editor"

export const EDITOR_LABELS = {
  cursor: "Cursor",
  vscode: "VS Code",
  zed: "Zed",
} as const satisfies Record<EditorId, string>

export const resolvePreferredEditor = (
  available: ReadonlyArray<EditorId>,
  stored: EditorId | null,
): EditorId | null => {
  if (stored !== null && available.includes(stored)) {
    return stored
  }
  return available[0] ?? null
}

export const readStoredPreferredEditor = (): EditorId | null => {
  try {
    const value = window.localStorage.getItem(PREFERRED_EDITOR_STORAGE_KEY)
    if (value === "cursor" || value === "vscode" || value === "zed") {
      return value
    }
    return null
  } catch {
    return null
  }
}

export const persistPreferredEditor = (editor: EditorId): void => {
  try {
    window.localStorage.setItem(PREFERRED_EDITOR_STORAGE_KEY, editor)
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}
