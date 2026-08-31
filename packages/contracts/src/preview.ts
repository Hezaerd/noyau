import { Schema } from "effect"

import { PreviewTabId, ThreadId } from "./ids.ts"

export class PreviewTabNotFound extends Schema.TaggedError<PreviewTabNotFound>()(
  "PreviewTabNotFound",
  {
    threadId: ThreadId,
    tabId: PreviewTabId,
  },
) {}

export class PreviewUrlInvalid extends Schema.TaggedError<PreviewUrlInvalid>()(
  "PreviewUrlInvalid",
  {
    threadId: ThreadId,
  },
) {}

export const PreviewNavStatus = Schema.Union([
  Schema.TaggedStruct("Idle", {}),
  Schema.TaggedStruct("Loading", {
    url: Schema.String,
  }),
  Schema.TaggedStruct("Success", {
    url: Schema.String,
    title: Schema.NullOr(Schema.String),
  }),
  Schema.TaggedStruct("LoadFailed", {
    url: Schema.String,
    message: Schema.NonEmptyString,
  }),
])
export type PreviewNavStatus = (typeof PreviewNavStatus)["Type"]

/** Session serveur d’un onglet browser. Pas l’onglet client du panneau. */
export const PreviewSessionSnapshot = Schema.Struct({
  tabId: PreviewTabId,
  threadId: ThreadId,
  navStatus: PreviewNavStatus,
  updatedAt: Schema.DateTimeUtcFromString,
})
export type PreviewSessionSnapshot = (typeof PreviewSessionSnapshot)["Type"]

export const PreviewOpenInput = Schema.Struct({
  threadId: ThreadId,
  url: Schema.optionalKey(Schema.String),
})
export type PreviewOpenInput = (typeof PreviewOpenInput)["Type"]

export const PreviewNavigateInput = Schema.Struct({
  threadId: ThreadId,
  tabId: PreviewTabId,
  url: Schema.String,
})
export type PreviewNavigateInput = (typeof PreviewNavigateInput)["Type"]

export const PreviewListInput = Schema.Struct({
  threadId: ThreadId,
})
export type PreviewListInput = (typeof PreviewListInput)["Type"]

export const PreviewListResult = Schema.Struct({
  threadId: ThreadId,
  activeTabId: Schema.NullOr(PreviewTabId),
  sessions: Schema.Array(PreviewSessionSnapshot),
})
export type PreviewListResult = (typeof PreviewListResult)["Type"]

export const PreviewCloseInput = Schema.Struct({
  threadId: ThreadId,
  tabId: PreviewTabId,
})
export type PreviewCloseInput = (typeof PreviewCloseInput)["Type"]

export const PreviewCloseResult = Schema.Struct({
  threadId: ThreadId,
  activeTabId: Schema.NullOr(PreviewTabId),
})
export type PreviewCloseResult = (typeof PreviewCloseResult)["Type"]
