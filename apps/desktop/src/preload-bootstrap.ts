import { decodeReleaseChannelFromMain, type DesktopReleaseChannel } from "./release-channel-bridge"

/** Pushed into `webPreferences.additionalArguments` so the sandboxed preload never needs sendSync. */
export const PRELOAD_RELEASE_CHANNEL_ARG = "--noyau-release-channel"
export const PRELOAD_APP_VERSION_ARG = "--noyau-app-version"

export interface PreloadBootstrap {
  readonly releaseChannel: DesktopReleaseChannel
  readonly appVersion: string
}

const encodeArg = (flag: string, value: string): string => `${flag}=${encodeURIComponent(value)}`

const readArg = (argv: ReadonlyArray<string>, flag: string): string | undefined => {
  const prefix = `${flag}=`
  for (const entry of argv) {
    if (!entry.startsWith(prefix)) {
      continue
    }
    return decodeURIComponent(entry.slice(prefix.length))
  }
  return undefined
}

export const encodePreloadBootstrapArgs = (bootstrap: PreloadBootstrap): ReadonlyArray<string> => [
  encodeArg(PRELOAD_RELEASE_CHANNEL_ARG, bootstrap.releaseChannel),
  encodeArg(PRELOAD_APP_VERSION_ARG, bootstrap.appVersion),
]

export const readPreloadBootstrapFromArgv = (argv: ReadonlyArray<string>): PreloadBootstrap => {
  const releaseChannelRaw = readArg(argv, PRELOAD_RELEASE_CHANNEL_ARG)
  if (releaseChannelRaw === undefined) {
    throw new Error(`Missing ${PRELOAD_RELEASE_CHANNEL_ARG} in renderer process.argv`)
  }
  const appVersionRaw = readArg(argv, PRELOAD_APP_VERSION_ARG)
  if (appVersionRaw === undefined) {
    throw new Error(`Missing ${PRELOAD_APP_VERSION_ARG} in renderer process.argv`)
  }
  return {
    releaseChannel: decodeReleaseChannelFromMain(releaseChannelRaw),
    appVersion: appVersionRaw,
  }
}
