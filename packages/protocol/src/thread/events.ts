import {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/protocol/entities/approvals"
import { TurnImageAttachments } from "@noyau/protocol/entities/attachment"
import { ThreadBranch, ThreadWorktreePath } from "@noyau/protocol/entities/checkout"
import { Provider } from "@noyau/protocol/entities/environment"
import { ModelSelection } from "@noyau/protocol/entities/model-selection"
import { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { Session } from "@noyau/protocol/entities/session"
import { TranscriptItem, TurnPresentation } from "@noyau/protocol/entities/transcript"
import {
  CheckpointRef,
  TurnDiffFile,
  TurnDiffStatus,
  TurnSettlementState,
} from "@noyau/protocol/entities/turn"
import { PrepareWorktree } from "@noyau/protocol/git"
import { ApprovalRequestId, ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const ThreadCreated = Schema.TaggedStruct("thread.created", {
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  provider: Provider,
  runtimeMode: RuntimeMode,
  modelSelection: Schema.optionalKey(ModelSelection),
  branch: Schema.optionalKey(ThreadBranch),
  worktreePath: Schema.optionalKey(ThreadWorktreePath),
})
export type ThreadCreated = (typeof ThreadCreated)["Type"]

export const ThreadArchived = Schema.TaggedStruct("thread.archived", {
  threadId: ThreadId,
})
export type ThreadArchived = (typeof ThreadArchived)["Type"]

export const ThreadRestored = Schema.TaggedStruct("thread.restored", {
  threadId: ThreadId,
})
export type ThreadRestored = (typeof ThreadRestored)["Type"]

export const ThreadSettled = Schema.TaggedStruct("thread.settled", {
  threadId: ThreadId,
  settledAt: Schema.DateTimeUtcFromString,
})
export type ThreadSettled = (typeof ThreadSettled)["Type"]

export const ThreadUnsettledReason = Schema.Literals(["user", "activity"])
export type ThreadUnsettledReason = (typeof ThreadUnsettledReason)["Type"]

export const ThreadUnsettled = Schema.TaggedStruct("thread.unsettled", {
  threadId: ThreadId,
  reason: ThreadUnsettledReason,
})
export type ThreadUnsettled = (typeof ThreadUnsettled)["Type"]

export const ThreadMetaUpdated = Schema.TaggedStruct("thread.meta-updated", {
  threadId: ThreadId,
  title: Schema.optionalKey(Schema.NonEmptyString),
  regenerateTitle: Schema.optionalKey(Schema.Literal(true)),
  branch: Schema.optionalKey(ThreadBranch),
  worktreePath: Schema.optionalKey(ThreadWorktreePath),
})
export type ThreadMetaUpdated = (typeof ThreadMetaUpdated)["Type"]

export const ThreadRuntimeModeSet = Schema.TaggedStruct("thread.runtime-mode-set", {
  threadId: ThreadId,
  runtimeMode: RuntimeMode,
})
export type ThreadRuntimeModeSet = (typeof ThreadRuntimeModeSet)["Type"]

export const ThreadModelSelectionSet = Schema.TaggedStruct("thread.model-selection-set", {
  threadId: ThreadId,
  modelSelection: Schema.NullOr(ModelSelection),
})
export type ThreadModelSelectionSet = (typeof ThreadModelSelectionSet)["Type"]

export const ThreadTurnStarted = Schema.TaggedStruct("thread.turn.started", {
  threadId: ThreadId,
  turnId: TurnId,
  text: Schema.optionalKey(Schema.NonEmptyString),
  titleSeed: Schema.optionalKey(Schema.NonEmptyString),
  runtimeMode: Schema.optionalKey(RuntimeMode),
  modelSelection: Schema.optionalKey(Schema.NullOr(ModelSelection)),
  prepareWorktree: Schema.optionalKey(PrepareWorktree),
  attachments: Schema.optionalKey(TurnImageAttachments),
  presentation: Schema.optionalKey(TurnPresentation),
})
export type ThreadTurnStarted = (typeof ThreadTurnStarted)["Type"]

export const ThreadTurnInterrupted = Schema.TaggedStruct("thread.turn.interrupted", {
  threadId: ThreadId,
  turnId: Schema.optionalKey(TurnId),
})
export type ThreadTurnInterrupted = (typeof ThreadTurnInterrupted)["Type"]

export const ApprovalResponded = Schema.TaggedStruct("approval.responded", {
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  decision: ProviderApprovalDecision,
})
export type ApprovalResponded = (typeof ApprovalResponded)["Type"]

export const UserInputResponded = Schema.TaggedStruct("user-input.responded", {
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
})
export type UserInputResponded = (typeof UserInputResponded)["Type"]

export const SessionStopRequested = Schema.TaggedStruct("session.stop-requested", {
  threadId: ThreadId,
})
export type SessionStopRequested = (typeof SessionStopRequested)["Type"]

export const ThreadSessionSet = Schema.TaggedStruct("thread.session-set", {
  threadId: ThreadId,
  session: Session,
})
export type ThreadSessionSet = (typeof ThreadSessionSet)["Type"]

export const ThreadTranscriptAppended = Schema.TaggedStruct("thread.transcript-appended", {
  item: TranscriptItem,
})
export type ThreadTranscriptAppended = (typeof ThreadTranscriptAppended)["Type"]

export const ThreadTurnEnded = Schema.TaggedStruct("thread.turn.ended", {
  threadId: ThreadId,
  turnId: TurnId,
  state: TurnSettlementState,
  lastError: Schema.optionalKey(Schema.NonEmptyString),
})
export type ThreadTurnEnded = (typeof ThreadTurnEnded)["Type"]

export const ThreadTitleSeeded = Schema.TaggedStruct("thread.title-seeded", {
  threadId: ThreadId,
  title: Schema.NonEmptyString,
})
export type ThreadTitleSeeded = (typeof ThreadTitleSeeded)["Type"]

export const ThreadTurnDiffCompleted = Schema.TaggedStruct("thread.turn-diff-completed", {
  threadId: ThreadId,
  turnId: TurnId,
  checkpointRef: CheckpointRef,
  status: TurnDiffStatus,
  files: Schema.Array(TurnDiffFile),
})
export type ThreadTurnDiffCompleted = (typeof ThreadTurnDiffCompleted)["Type"]

export const ThreadEvent = Schema.Union([
  ThreadCreated,
  ThreadArchived,
  ThreadRestored,
  ThreadSettled,
  ThreadUnsettled,
  ThreadMetaUpdated,
  ThreadRuntimeModeSet,
  ThreadModelSelectionSet,
  ThreadTurnStarted,
  ThreadTurnInterrupted,
  ApprovalResponded,
  UserInputResponded,
  SessionStopRequested,
  ThreadSessionSet,
  ThreadTranscriptAppended,
  ThreadTurnEnded,
  ThreadTitleSeeded,
  ThreadTurnDiffCompleted,
])
export type ThreadEvent = (typeof ThreadEvent)["Type"]
