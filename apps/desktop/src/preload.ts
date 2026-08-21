import { contextBridge, ipcRenderer } from "electron"

import { GET_CURSOR_POINT_CHANNEL, type CursorClientPoint } from "./cursor-point"
import { PICK_FOLDER_CHANNEL } from "./folder-picker"
import { SET_THEME_CHANNEL, type AppearancePreference } from "./theme"

export interface NoyauDesktopBridge {
  readonly platform: NodeJS.Platform
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
  readonly pickFolder: () => Promise<string | undefined>
  readonly getCursorPoint: () => Promise<CursorClientPoint | undefined>
}

const desktopBridge: NoyauDesktopBridge = Object.freeze({
  platform: process.platform,
  setTheme: (theme: AppearancePreference): Promise<void> =>
    ipcRenderer.invoke(SET_THEME_CHANNEL, theme).then(() => undefined),
  pickFolder: (): Promise<string | undefined> => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
  getCursorPoint: (): Promise<CursorClientPoint | undefined> =>
    ipcRenderer.invoke(GET_CURSOR_POINT_CHANNEL),
})

contextBridge.exposeInMainWorld("noyauDesktop", desktopBridge)
