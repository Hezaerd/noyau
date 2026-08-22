export const RELEASE_CHANNELS = ["development", "latest", "nightly"] as const

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number]

export const DEFAULT_RELEASE_CHANNEL: ReleaseChannel = "latest"

const discordApplicationIconUrl = (applicationId: string, iconHash: string): string =>
  `https://cdn.discordapp.com/app-icons/${applicationId}/${iconHash}.png`

export const RELEASE_BRANDS = {
  development: {
    displayName: "Noyau (Dev)",
    bundleId: "dev.noyau.desktop.dev",
    iconDirectory: "dev",
    appearance: "dark",
    palette: {
      background: "#1a1208",
      head: "#c45c26",
      eye: "#ffe7c2",
    },
    discord: {
      applicationId: "1540812507592265738",
      largeImage: discordApplicationIconUrl(
        "1540812507592265738",
        "221d3f3e35156e925b6e1b79ec34bd93",
      ),
    },
  },
  latest: {
    displayName: "Noyau",
    bundleId: "dev.noyau.desktop",
    iconDirectory: "prod",
    appearance: "light",
    palette: {
      background: "#ebe9f4",
      head: "#6154e0",
      eye: "#f7f5ff",
    },
    discord: {
      applicationId: "1540464789850169484",
      largeImage: discordApplicationIconUrl(
        "1540464789850169484",
        "7b71a8fcebc1aaa70f76ae218bcb421a",
      ),
    },
  },
  nightly: {
    displayName: "Noyau (Nightly)",
    bundleId: "dev.noyau.desktop.nightly",
    iconDirectory: "nightly",
    appearance: "dark",
    palette: {
      background: "#0a0a0e",
      head: "#302b4b",
      eye: "#e2ddff",
    },
    discord: {
      applicationId: "1540445560736321627",
      largeImage: discordApplicationIconUrl(
        "1540445560736321627",
        "64fa989ceb568f6ee3b6a2267abd6b77",
      ),
    },
  },
} as const

export const parseReleaseChannel = (raw: string | undefined): ReleaseChannel | undefined =>
  RELEASE_CHANNELS.find((channel) => channel === raw)

export const releaseBrand = (channel: ReleaseChannel) => RELEASE_BRANDS[channel]
