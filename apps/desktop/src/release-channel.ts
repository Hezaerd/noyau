import {
  DEFAULT_RELEASE_CHANNEL,
  parseReleaseChannel,
  releaseBrand,
  type ReleaseChannel,
} from "@noyau/shared/release-brand"
import { Schema } from "effect"

export const RELEASE_CHANNEL_ENV = "NOYAU_RELEASE_CHANNEL"

export const PackagedReleaseChannelFile = Schema.Struct({
  channel: Schema.Literals(["latest", "nightly"]),
})
export const decodePackagedReleaseChannelFile = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PackagedReleaseChannelFile),
)

export type DesktopReleaseChannel = ReleaseChannel

export const parseDesktopReleaseChannel = (
  raw: string | undefined,
): DesktopReleaseChannel | undefined => parseReleaseChannel(raw)

export const desktopBrandName = (channel: DesktopReleaseChannel): string =>
  releaseBrand(channel).displayName

export const desktopIconDirectory = (channel: DesktopReleaseChannel): string =>
  releaseBrand(channel).iconDirectory

export const isDesktopDevelopmentChannel = (channel: DesktopReleaseChannel): boolean =>
  channel === "development"

export const resolveDesktopReleaseChannel = (
  envChannel: string | undefined,
  packagedChannel: string | undefined,
): DesktopReleaseChannel => {
  const fromEnv = parseDesktopReleaseChannel(envChannel)
  if (fromEnv !== undefined) {
    return fromEnv
  }
  const fromPackage = parseDesktopReleaseChannel(packagedChannel)
  if (fromPackage !== undefined && fromPackage !== "development") {
    return fromPackage
  }
  return DEFAULT_RELEASE_CHANNEL
}
