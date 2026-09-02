export const CHECK_DESKTOP_UPDATE_CHANNEL = "noyau:desktop-update-check"
export const OPEN_DESKTOP_INSTALLER_CHANNEL = "noyau:desktop-update-open-installer"

export type DesktopUpdatePackagedChannel = "latest" | "nightly"

export type DesktopUpdateCheckResult =
  | { readonly _tag: "unsupported"; readonly currentVersion: string }
  | {
      readonly _tag: "current"
      readonly currentVersion: string
      readonly channel: DesktopUpdatePackagedChannel
    }
  | {
      readonly _tag: "available"
      readonly currentVersion: string
      readonly availableVersion: string
      readonly installerName: string
      readonly installerUrl: string
      readonly releaseUrl: string
      readonly channel: DesktopUpdatePackagedChannel
    }
  | {
      readonly _tag: "missing"
      readonly currentVersion: string
      readonly channel: DesktopUpdatePackagedChannel
      readonly reason: "no-release" | "no-installer"
    }
  | { readonly _tag: "failed"; readonly currentVersion: string; readonly message: string }

export type DesktopUpdateOpenResult =
  | { readonly _tag: "opened" }
  | {
      readonly _tag: "unavailable"
      readonly reason: "unsupported" | "current" | "missing" | "failed"
      readonly message?: string
    }
  | { readonly _tag: "failed"; readonly message: string }
