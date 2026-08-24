import { Schema } from "effect"

export const CHECK_DESKTOP_UPDATE_CHANNEL = "noyau:desktop-update-check"
export const OPEN_DESKTOP_INSTALLER_CHANNEL = "noyau:desktop-update-open-installer"
export const GET_APP_VERSION_CHANNEL = "noyau:desktop:get-app-version"

export const DesktopUpdatePackagedChannel = Schema.Literals(["latest", "nightly"])
export type DesktopUpdatePackagedChannel = typeof DesktopUpdatePackagedChannel.Type

export const DesktopUpdateMissingReason = Schema.Literals(["no-release", "no-installer"])
export type DesktopUpdateMissingReason = typeof DesktopUpdateMissingReason.Type

export const DesktopUpdateRequest = Schema.Struct({
  channel: Schema.optionalKey(DesktopUpdatePackagedChannel),
})
export type DesktopUpdateRequest = typeof DesktopUpdateRequest.Type

export const decodeDesktopUpdateRequest = Schema.decodeUnknownEffect(DesktopUpdateRequest)

export const DesktopUpdateCheckResult = Schema.Union([
  Schema.TaggedStruct("unsupported", {
    currentVersion: Schema.String,
  }),
  Schema.TaggedStruct("current", {
    currentVersion: Schema.String,
    channel: DesktopUpdatePackagedChannel,
  }),
  Schema.TaggedStruct("available", {
    currentVersion: Schema.String,
    availableVersion: Schema.String,
    installerName: Schema.String,
    installerUrl: Schema.String,
    releaseUrl: Schema.String,
    channel: DesktopUpdatePackagedChannel,
  }),
  Schema.TaggedStruct("missing", {
    currentVersion: Schema.String,
    channel: DesktopUpdatePackagedChannel,
    reason: DesktopUpdateMissingReason,
  }),
  Schema.TaggedStruct("failed", {
    currentVersion: Schema.String,
    message: Schema.String,
  }),
])
export type DesktopUpdateCheckResult = typeof DesktopUpdateCheckResult.Type

export const DesktopUpdateOpenResult = Schema.Union([
  Schema.TaggedStruct("opened", {}),
  Schema.TaggedStruct("unavailable", {
    reason: Schema.Literals(["unsupported", "current", "missing", "failed"]),
    message: Schema.optionalKey(Schema.String),
  }),
  Schema.TaggedStruct("failed", {
    message: Schema.String,
  }),
])
export type DesktopUpdateOpenResult = typeof DesktopUpdateOpenResult.Type

export const decodeDesktopUpdateCheckResult = Schema.decodeUnknownEffect(DesktopUpdateCheckResult)
export const decodeDesktopUpdateOpenResult = Schema.decodeUnknownEffect(DesktopUpdateOpenResult)
