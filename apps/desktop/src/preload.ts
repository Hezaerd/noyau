import { contextBridge, ipcRenderer } from "electron"

import { GET_CURSOR_POINT_CHANNEL, type CursorClientPoint } from "./cursor-point"
import { PICK_FOLDER_CHANNEL, type FolderPickerOptions } from "./folder-picker"
import { OPEN_PATH_CHANNEL } from "./open-path"
import { SET_THEME_CHANNEL, type AppearancePreference } from "./theme"

export type DesktopReleaseChannel = "development" | "latest" | "nightly"

export interface NoyauDesktopBridge {
  readonly platform: NodeJS.Platform
  readonly releaseChannel: DesktopReleaseChannel
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
  readonly pickFolder: (options?: FolderPickerOptions) => Promise<string | undefined>
  readonly openPath: (path: string) => Promise<void>
  readonly getCursorPoint: () => Promise<CursorClientPoint | undefined>
}

const readReleaseChannel = (): DesktopReleaseChannel => {
  const raw = process.env.NOYAU_RELEASE_CHANNEL
  if (raw === "development" || raw === "latest" || raw === "nightly") {
    return raw
  }
  return "latest"
}

const desktopBridge: NoyauDesktopBridge = Object.freeze({
  platform: process.platform,
  releaseChannel: readReleaseChannel(),
  setTheme: (theme: AppearancePreference): Promise<void> =>
    ipcRenderer.invoke(SET_THEME_CHANNEL, theme).then(() => undefined),
  pickFolder: (options?: FolderPickerOptions): Promise<string | undefined> =>
    ipcRenderer.invoke(PICK_FOLDER_CHANNEL, options),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke(OPEN_PATH_CHANNEL, path),
  getCursorPoint: (): Promise<CursorClientPoint | undefined> =>
    ipcRenderer.invoke(GET_CURSOR_POINT_CHANNEL),
})

contextBridge.exposeInMainWorld("noyauDesktop", desktopBridge)
