import { parseReleaseChannel, type ReleaseChannel } from "@noyau/shared/release-brand"

export type DesktopReleaseChannel = ReleaseChannel

/** Strict and dependency-free because Electron executes the preload in a restricted sandbox. */
export const decodeReleaseChannelFromMain = (raw: string): DesktopReleaseChannel => {
  const channel = parseReleaseChannel(raw)
  if (channel === undefined) {
    throw new Error(`Invalid release channel received from Electron main: ${raw}`)
  }
  return channel
}
