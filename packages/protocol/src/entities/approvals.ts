import { Schema } from "effect"

export const ProviderApprovalDecision = Schema.Literals([
  "accept",
  "acceptForSession",
  "decline",
  "cancel",
])
export type ProviderApprovalDecision = (typeof ProviderApprovalDecision)["Type"]

export const ProviderUserInputAnswers = Schema.Record(Schema.String, Schema.Unknown)
export type ProviderUserInputAnswers = (typeof ProviderUserInputAnswers)["Type"]
