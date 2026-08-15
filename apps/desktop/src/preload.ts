import { contextBridge, ipcRenderer } from "electron"

import { SET_THEME_CHANNEL, type AppearancePreference } from "./theme"

export interface NoyauDesktopBridge {
  readonly platform: NodeJS.Platform
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
}

const desktopBridge: NoyauDesktopBridge = Object.freeze({
  platform: process.platform,
  setTheme: (theme: AppearancePreference): Promise<void> =>
    ipcRenderer.invoke(SET_THEME_CHANNEL, theme).then(() => undefined),
})

contextBridge.exposeInMainWorld("noyauDesktop", desktopBridge)
