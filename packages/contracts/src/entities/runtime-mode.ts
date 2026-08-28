import { Schema } from "effect"

export const RuntimeMode = Schema.Literals([
  "approval-required",
  "auto-accept-edits",
  "auto",
  "full-access",
])
export type RuntimeMode = (typeof RuntimeMode)["Type"]

export const DEFAULT_RUNTIME_MODE = "full-access" as const satisfies RuntimeMode
