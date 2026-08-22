import { Schema } from "effect"

export const PICK_FOLDER_CHANNEL = "noyau:pick-folder"

export const FolderPickerOptionsSchema = Schema.Struct({
  initialPath: Schema.optionalKey(Schema.String),
})

export type FolderPickerOptions = Schema.Schema.Type<typeof FolderPickerOptionsSchema>

export const decodeFolderPickerOptions = Schema.decodeUnknownEffect(FolderPickerOptionsSchema)

export interface FolderPickerOpenDialogOptions {
  readonly defaultPath: string
  readonly properties: Array<"openDirectory">
}

export const folderPickerOpenDialogOptions = (
  defaultPath: string,
): FolderPickerOpenDialogOptions => ({
  defaultPath,
  properties: ["openDirectory"],
})

/** Drops a destroyed or missing BrowserWindow so the dialog is never attached to a dead owner. */
export const folderPickerOwner = <Window extends { readonly isDestroyed: () => boolean }>(
  window: Window | null,
): Window | undefined => {
  if (window === null || window.isDestroyed()) {
    return undefined
  }
  return window
}

export const selectedFolderPath = (result: {
  readonly canceled: boolean
  readonly filePaths: readonly string[]
}): string | undefined => (result.canceled ? undefined : result.filePaths[0])

/** Resolves the renderer's optional path without ever exposing the home directory there. */
export const resolveFolderPickerDefaultPath = (
  initialPath: string | undefined,
  homeDirectory: string,
): string => {
  if (initialPath === undefined || initialPath.trim() === "" || initialPath.trim() === "~") {
    return homeDirectory
  }

  const trimmedPath = initialPath.trim()
  if (trimmedPath.startsWith("~/") || trimmedPath.startsWith("~\\")) {
    const separator = homeDirectory.includes("\\") ? "\\" : "/"
    return `${homeDirectory.replace(/[\\/]$/u, "")}${separator}${trimmedPath.slice(2)}`
  }

  return trimmedPath
}
