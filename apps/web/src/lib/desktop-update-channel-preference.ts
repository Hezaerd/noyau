import { Option, Schema } from "effect"

import {
  desktopReleaseChannel,
  type DesktopReleaseChannel,
  type DesktopUpdatePackagedChannel,
} from "@/lib/desktop-bridge"

export const DESKTOP_UPDATE_CHANNEL_STORAGE_KEY = "noyau:desktop-update-channel"

export const DESKTOP_UPDATE_CHANNEL_ITEMS = [
  { value: "latest", label: "latest" },
  { value: "nightly", label: "nightly" },
] as const

const DesktopUpdateChannelPreference = Schema.Literals(["latest", "nightly"])
const decodeDesktopUpdateChannelPreference = Schema.decodeUnknownOption(
  DesktopUpdateChannelPreference,
)

export const isDesktopUpdatePackagedChannel = (
  value: string,
): value is DesktopUpdatePackagedChannel => value === "latest" || value === "nightly"

export const defaultDesktopUpdateChannel = (
  packaged: DesktopReleaseChannel,
): DesktopUpdatePackagedChannel => (packaged === "nightly" ? "nightly" : "latest")

export const parseDesktopUpdateChannelPreference = (
  value: string | null,
  packaged: DesktopReleaseChannel,
): DesktopUpdatePackagedChannel =>
  Option.getOrElse(decodeDesktopUpdateChannelPreference(value), () =>
    defaultDesktopUpdateChannel(packaged),
  )

export const readStoredDesktopUpdateChannel = (): DesktopUpdatePackagedChannel => {
  try {
    return parseDesktopUpdateChannelPreference(
      window.localStorage.getItem(DESKTOP_UPDATE_CHANNEL_STORAGE_KEY),
      desktopReleaseChannel(),
    )
  } catch {
    return defaultDesktopUpdateChannel(desktopReleaseChannel())
  }
}

export const persistDesktopUpdateChannel = (channel: DesktopUpdatePackagedChannel): void => {
  const packaged = desktopReleaseChannel()
  try {
    if (packaged !== "development" && channel === packaged) {
      window.localStorage.removeItem(DESKTOP_UPDATE_CHANNEL_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(DESKTOP_UPDATE_CHANNEL_STORAGE_KEY, channel)
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}
