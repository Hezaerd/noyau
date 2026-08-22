import { contextBridge, ipcRenderer } from "electron"

import { GET_CURSOR_POINT_CHANNEL, type CursorClientPoint } from "./cursor-point"
import { PICK_FOLDER_CHANNEL, type FolderPickerOptions } from "./folder-picker"
import { OPEN_PATH_CHANNEL } from "./open-path"
import { SET_THEME_CHANNEL, type AppearancePreference } from "./theme"

export interface NoyauDesktopBridge {
  readonly platform: NodeJS.Platform
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
  readonly pickFolder: (options?: FolderPickerOptions) => Promise<string | undefined>
  readonly openPath: (path: string) => Promise<void>
  readonly getCursorPoint: () => Promise<CursorClientPoint | undefined>
}

const desktopBridge: NoyauDesktopBridge = Object.freeze({
  platform: process.platform,
  setTheme: (theme: AppearancePreference): Promise<void> =>
    ipcRenderer.invoke(SET_THEME_CHANNEL, theme).then(() => undefined),
  pickFolder: (options?: FolderPickerOptions): Promise<string | undefined> =>
    ipcRenderer.invoke(PICK_FOLDER_CHANNEL, options),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke(OPEN_PATH_CHANNEL, path),
  getCursorPoint: (): Promise<CursorClientPoint | undefined> =>
    ipcRenderer.invoke(GET_CURSOR_POINT_CHANNEL),
})

contextBridge.exposeInMainWorld("noyauDesktop", desktopBridge)
