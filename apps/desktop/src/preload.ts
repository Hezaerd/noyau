import { contextBridge, ipcRenderer } from "electron"

import { GET_CURSOR_POINT_CHANNEL, type CursorClientPoint } from "./cursor-point"
import {
  CHECK_DESKTOP_UPDATE_CHANNEL,
  GET_APP_VERSION_CHANNEL,
  OPEN_DESKTOP_INSTALLER_CHANNEL,
  type DesktopUpdateCheckResult,
  type DesktopUpdateOpenResult,
  type DesktopUpdatePackagedChannel,
} from "./desktop-update-contract"
import { PICK_FOLDER_CHANNEL, type FolderPickerOptions } from "./folder-picker-contract"
import { OPEN_PATH_CHANNEL } from "./open-path-contract"
import {
  decodeReleaseChannelFromMain,
  GET_RELEASE_CHANNEL_CHANNEL,
  type DesktopReleaseChannel,
} from "./release-channel-bridge"
import { SET_THEME_CHANNEL, type AppearancePreference } from "./theme"

export interface NoyauDesktopBridge {
  readonly platform: NodeJS.Platform
  readonly releaseChannel: DesktopReleaseChannel
  readonly appVersion: string
  readonly setTheme: (theme: AppearancePreference) => Promise<void>
  readonly pickFolder: (options?: FolderPickerOptions) => Promise<string | undefined>
  readonly openPath: (path: string) => Promise<void>
  readonly getCursorPoint: () => Promise<CursorClientPoint | undefined>
  readonly checkDesktopUpdate: (
    channel?: DesktopUpdatePackagedChannel,
  ) => Promise<DesktopUpdateCheckResult>
  readonly openDesktopInstaller: (
    channel?: DesktopUpdatePackagedChannel,
  ) => Promise<DesktopUpdateOpenResult>
}

const desktopBridge: NoyauDesktopBridge = Object.freeze({
  platform: process.platform,
  releaseChannel: decodeReleaseChannelFromMain(
    String(ipcRenderer.sendSync(GET_RELEASE_CHANNEL_CHANNEL)),
  ),
  appVersion: String(ipcRenderer.sendSync(GET_APP_VERSION_CHANNEL)),
  setTheme: (theme: AppearancePreference): Promise<void> =>
    ipcRenderer.invoke(SET_THEME_CHANNEL, theme).then(() => undefined),
  pickFolder: (options?: FolderPickerOptions): Promise<string | undefined> =>
    ipcRenderer.invoke(PICK_FOLDER_CHANNEL, options),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke(OPEN_PATH_CHANNEL, path),
  getCursorPoint: (): Promise<CursorClientPoint | undefined> =>
    ipcRenderer.invoke(GET_CURSOR_POINT_CHANNEL),
  checkDesktopUpdate: (channel?: DesktopUpdatePackagedChannel): Promise<DesktopUpdateCheckResult> =>
    ipcRenderer.invoke(CHECK_DESKTOP_UPDATE_CHANNEL, channel === undefined ? {} : { channel }),
  openDesktopInstaller: (
    channel?: DesktopUpdatePackagedChannel,
  ): Promise<DesktopUpdateOpenResult> =>
    ipcRenderer.invoke(OPEN_DESKTOP_INSTALLER_CHANNEL, channel === undefined ? {} : { channel }),
})

contextBridge.exposeInMainWorld("noyauDesktop", desktopBridge)
