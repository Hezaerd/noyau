import { ProviderUserInputAnswers, UserInputQuestion } from "@noyau/protocol/entities/approvals"
import { TurnImageAttachments, turnHasPrompt } from "@noyau/protocol/entities/attachment"
import { ApprovalRequestId, ThreadId, ToolCallId, TurnId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const TranscriptToolStatus = Schema.Literals(["in_progress", "completed", "error"])
export type TranscriptToolStatus = (typeof TranscriptToolStatus)["Type"]

export const TranscriptToolAction = Schema.Literals([
  "command",
  "read",
  "file_change",
  "search",
  "fetch",
  "think",
  "other",
])
export type TranscriptToolAction = (typeof TranscriptToolAction)["Type"]

export const TranscriptRequestStatus = Schema.Literals(["pending", "resolved"])
export type TranscriptRequestStatus = (typeof TranscriptRequestStatus)["Type"]

/** Comment le prompt utilisateur est montré. Le `text` reste le prompt Provider. */
export const TurnPresentation = Schema.Literals(["fix-merge-conflicts", "fix-ci"])
export type TurnPresentation = (typeof TurnPresentation)["Type"]

export const TranscriptUser = Schema.TaggedStruct("transcript.user", {
  threadId: ThreadId,
  turnId: TurnId,
  text: Schema.optionalKey(Schema.NonEmptyString),
  attachments: Schema.optionalKey(TurnImageAttachments),
  presentation: Schema.optionalKey(TurnPresentation),
}).check(
  Schema.makeFilter(turnHasPrompt, {
    expected: "non-empty text or at least one image attachment",
  }),
)
export type TranscriptUser = (typeof TranscriptUser)["Type"]

export const TranscriptAssistant = Schema.TaggedStruct("transcript.assistant", {
  threadId: ThreadId,
  turnId: TurnId,
  text: Schema.String,
})
export type TranscriptAssistant = (typeof TranscriptAssistant)["Type"]

export const TranscriptTool = Schema.TaggedStruct("transcript.tool", {
  threadId: ThreadId,
  turnId: TurnId,
  toolCallId: ToolCallId,
  name: Schema.NonEmptyString,
  status: TranscriptToolStatus,
  action: Schema.optionalKey(TranscriptToolAction),
  outputSummary: Schema.optionalKey(Schema.String),
})
export type TranscriptTool = (typeof TranscriptTool)["Type"]

export const TranscriptPermission = Schema.TaggedStruct("transcript.permission", {
  threadId: ThreadId,
  turnId: TurnId,
  requestId: ApprovalRequestId,
  status: TranscriptRequestStatus,
})
export type TranscriptPermission = (typeof TranscriptPermission)["Type"]

export const TranscriptUserInput = Schema.TaggedStruct("transcript.user-input", {
  threadId: ThreadId,
  turnId: TurnId,
  requestId: ApprovalRequestId,
  /** Legacy / résumé ; les emitters riches remplissent `questions`. */
  prompt: Schema.optionalKey(Schema.NonEmptyString),
  title: Schema.optionalKey(Schema.NonEmptyString),
  questions: Schema.optionalKey(Schema.Array(UserInputQuestion)),
  /** Présent quand `status` est `resolved`. */
  answers: Schema.optionalKey(ProviderUserInputAnswers),
  status: TranscriptRequestStatus,
})
export type TranscriptUserInput = (typeof TranscriptUserInput)["Type"]

export const TranscriptPlan = Schema.TaggedStruct("transcript.plan", {
  threadId: ThreadId,
  turnId: TurnId,
  markdown: Schema.NonEmptyString,
})
export type TranscriptPlan = (typeof TranscriptPlan)["Type"]

export const TranscriptItem = Schema.Union([
  TranscriptUser,
  TranscriptAssistant,
  TranscriptTool,
  TranscriptPermission,
  TranscriptUserInput,
  TranscriptPlan,
])
export type TranscriptItem = (typeof TranscriptItem)["Type"]
