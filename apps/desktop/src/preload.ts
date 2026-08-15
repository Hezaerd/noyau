import { contextBridge } from "electron"

export interface NoyauDesktopBridge {
  readonly platform: NodeJS.Platform
}

const desktopBridge: NoyauDesktopBridge = Object.freeze({
  platform: process.platform,
})

contextBridge.exposeInMainWorld("noyauDesktop", desktopBridge)
