import { contextBridge, ipcRenderer } from "electron"

import { SET_THEME_CHANNEL, type AppearancePreference } from "./theme"

export const PICK_FOLDER_CHANNEL = "noyau:pick-folder"

export interface NoyauDesktopBridge {
  readonly platform: NodeJS.Platform
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
  readonly pickFolder: () => Promise<string | undefined>
}

const desktopBridge: NoyauDesktopBridge = Object.freeze({
  platform: process.platform,
  setTheme: (theme: AppearancePreference): Promise<void> =>
    ipcRenderer.invoke(SET_THEME_CHANNEL, theme).then(() => undefined),
  pickFolder: (): Promise<string | undefined> => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
})

contextBridge.exposeInMainWorld("noyauDesktop", desktopBridge)
