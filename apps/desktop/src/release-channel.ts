import { Schema } from "effect"

export const RELEASE_CHANNEL_ENV = "NOYAU_RELEASE_CHANNEL"

export const PackagedReleaseChannelFile = Schema.Struct({
  channel: Schema.Literals(["latest", "nightly"]),
})
export const decodePackagedReleaseChannelFile = Schema.decodeUnknownEffect(
  Schema.fromJsonString(PackagedReleaseChannelFile),
)

const NIGHTLY_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+-nightly\.\d{8}\.\d+$/

export type DesktopReleaseChannel = "development" | "latest" | "nightly"

export const parseDesktopReleaseChannel = (
  raw: string | undefined,
): DesktopReleaseChannel | undefined => {
  if (raw === "development" || raw === "latest" || raw === "nightly") {
    return raw
  }
  return undefined
}

export const desktopBrandName = (channel: DesktopReleaseChannel): string => {
  if (channel === "development") {
    return "Noyau (Dev)"
  }
  if (channel === "nightly") {
    return "Noyau (Nightly)"
  }
  return "Noyau"
}

export const desktopIconDirectory = (channel: DesktopReleaseChannel): string => {
  if (channel === "development") {
    return "dev"
  }
  if (channel === "nightly") {
    return "nightly"
  }
  return "prod"
}

export const isDesktopDevelopmentChannel = (channel: DesktopReleaseChannel): boolean =>
  channel === "development"

export const resolveDesktopReleaseChannel = (
  envChannel: string | undefined,
  packagedChannel: string | undefined,
  appVersion: string,
): DesktopReleaseChannel => {
  const fromEnv = parseDesktopReleaseChannel(envChannel)
  if (fromEnv !== undefined) {
    return fromEnv
  }
  const fromPackage = parseDesktopReleaseChannel(packagedChannel)
  if (fromPackage !== undefined && fromPackage !== "development") {
    return fromPackage
  }
  return NIGHTLY_VERSION_PATTERN.test(appVersion) ? "nightly" : "latest"
}
