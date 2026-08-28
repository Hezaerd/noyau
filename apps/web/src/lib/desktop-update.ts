import type {
  DesktopReleaseChannel,
  DesktopUpdateCheckResult,
  DesktopUpdateOpenResult,
  DesktopUpdatePackagedChannel,
} from "@/lib/desktop-bridge"

export type DesktopUpdatePhase = "idle" | "checking" | "opening"

export interface DesktopUpdateState {
  readonly phase: DesktopUpdatePhase
  readonly result: DesktopUpdateCheckResult | undefined
}

export const initialDesktopUpdateState = (currentVersion: string): DesktopUpdateState => ({
  phase: "idle",
  result: currentVersion === "" ? undefined : { _tag: "unsupported", currentVersion },
})

const PLACEHOLDER_APP_VERSION = /^(0\.0\.0(?:\+.*)?)$/

export const desktopUpdateVersionLine = (currentVersion: string): string => {
  const version = currentVersion.trim()
  if (version === "" || PLACEHOLDER_APP_VERSION.test(version)) {
    return ""
  }
  return version
}

export const desktopUpdateDescription = (
  state: DesktopUpdateState,
  versionLine: string,
  packagedChannel: DesktopReleaseChannel = "latest",
): string => {
  const status = desktopUpdateStatusLabel(state, packagedChannel)
  return versionLine === "" ? status : `${versionLine} — ${status}`
}

export const desktopUpdateHasInstaller = (
  result: DesktopUpdateCheckResult | undefined,
): result is Extract<DesktopUpdateCheckResult, { readonly _tag: "available" }> =>
  result?._tag === "available"

export const desktopUpdateIsChannelSwitch = (
  resultChannel: DesktopUpdatePackagedChannel | undefined,
  packagedChannel: DesktopReleaseChannel,
): boolean =>
  resultChannel !== undefined &&
  packagedChannel !== "development" &&
  resultChannel !== packagedChannel

export const desktopUpdateStatusLabel = (
  state: DesktopUpdateState,
  packagedChannel: DesktopReleaseChannel = "latest",
): string => {
  if (state.phase === "checking") {
    return "Checking…"
  }
  if (state.phase === "opening") {
    return "Opening the installer…"
  }
  const result = state.result
  if (result === undefined) {
    return "Not checked yet."
  }
  switch (result._tag) {
    case "unsupported":
      return "Local build — no updates."
    case "current":
      return "Up to date."
    case "available":
      return desktopUpdateIsChannelSwitch(result.channel, packagedChannel)
        ? `${result.channel} installer v${result.availableVersion} — separate app.`
        : `v${result.availableVersion} available.`
    case "missing":
      return result.reason === "no-installer"
        ? "No installer for this machine."
        : "No Release on this channel."
    case "failed":
      return result.message
  }
}

export const desktopUpdatePrimaryAction = (state: DesktopUpdateState): "open" | "check" | null => {
  if (state.phase !== "idle") {
    return null
  }
  if (state.result?._tag === "unsupported") {
    return null
  }
  return desktopUpdateHasInstaller(state.result) ? "open" : "check"
}

export const desktopUpdatePrimaryActionLabel = (action: "open" | "check"): string =>
  action === "open" ? "Open installer" : "Check"

export const desktopUpdateOpenErrorMessage = (
  result: DesktopUpdateOpenResult,
): string | undefined => {
  if (result._tag === "failed") {
    return result.message
  }
  if (result._tag === "unavailable") {
    return result.message ?? "No installer to open."
  }
  return undefined
}
