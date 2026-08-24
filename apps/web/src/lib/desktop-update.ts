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

export const desktopUpdateVersionLine = (
  currentVersion: string,
  channelHint: "dev" | "nightly" | undefined,
): string => {
  if (currentVersion === "") {
    return channelHint ?? ""
  }
  return channelHint === undefined ? currentVersion : `${currentVersion} · ${channelHint}`
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
    return "Vérification…"
  }
  if (state.phase === "opening") {
    return "Ouverture de l’installeur…"
  }
  const result = state.result
  if (result === undefined) {
    return "Pas encore vérifié."
  }
  switch (result._tag) {
    case "unsupported":
      return "Build locale — pas de mise à jour."
    case "current":
      return "À jour."
    case "available":
      return desktopUpdateIsChannelSwitch(result.channel, packagedChannel)
        ? `Installeur ${result.channel} v${result.availableVersion} — app séparée.`
        : `v${result.availableVersion} disponible.`
    case "missing":
      return result.reason === "no-installer"
        ? "Aucun installeur pour cette machine."
        : "Aucune Release sur ce canal."
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
  action === "open" ? "Ouvrir l’installeur" : "Vérifier"

export const desktopUpdateOpenErrorMessage = (
  result: DesktopUpdateOpenResult,
): string | undefined => {
  if (result._tag === "failed") {
    return result.message
  }
  if (result._tag === "unavailable") {
    return result.message ?? "Aucun installeur à ouvrir."
  }
  return undefined
}
