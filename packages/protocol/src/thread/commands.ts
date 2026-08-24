import {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/protocol/entities/approvals"
import {
  TurnImageAttachments,
  TurnImageUploads,
  turnHasPrompt,
} from "@noyau/protocol/entities/attachment"
import { ThreadBranch, ThreadWorktreePath } from "@noyau/protocol/entities/checkout"
import { ModelSelection } from "@noyau/protocol/entities/model-selection"
import { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { Session } from "@noyau/protocol/entities/session"
import { TranscriptItem, TurnPresentation } from "@noyau/protocol/entities/transcript"
import { TurnSettlementState } from "@noyau/protocol/entities/turn"
import { PrepareWorktree } from "@noyau/protocol/git"
import {
  ActorId,
  ApprovalRequestId,
  CommandId,
  CorrelationId,
  EventId,
  ProjectId,
  SchemaVersion,
  ThreadId,
  TurnId,
} from "@noyau/protocol/ids"
import { Schema } from "effect"

const requestMeta = {
  commandId: CommandId,
  causationId: Schema.optionalKey(EventId),
} as const

const commandMeta = {
  commandId: CommandId,
  projectId: ProjectId,
  actorId: ActorId,
  correlationId: CorrelationId,
  causationId: Schema.optionalKey(EventId),
  issuedAt: Schema.DateTimeUtcFromString,
  schemaVersion: SchemaVersion,
} as const

const request = <Tag extends string, Payload extends Schema.Top>(tag: Tag, payload: Payload) =>
  Schema.TaggedStruct(tag, { ...requestMeta, payload })

const command = <Tag extends string, Payload extends Schema.Top>(tag: Tag, payload: Payload) =>
  Schema.TaggedStruct(tag, { ...commandMeta, payload })

export { ProviderApprovalDecision, ProviderUserInputAnswers }

const turnPromptContent = Schema.makeFilter(
  (value: {
    readonly text?: string
    readonly attachments?: ReadonlyArray<unknown>
    readonly image?: unknown
    readonly images?: unknown
  }) => turnHasPrompt(value) && value.image === undefined && value.images === undefined,
  {
    expected: "non-empty text or attachments[]; image/images keys are rejected",
  },
)

const threadCreatePayload = {
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  runtimeMode: Schema.optionalKey(RuntimeMode),
  modelSelection: Schema.optionalKey(ModelSelection),
  branch: Schema.optionalKey(ThreadBranch),
  worktreePath: Schema.optionalKey(ThreadWorktreePath),
} as const

const threadIdPayload = {
  threadId: ThreadId,
} as const

const exclusiveTitleIntent = Schema.makeFilter(
  (value: {
    readonly title?: string
    readonly regenerateTitle?: true
    readonly branch?: string | null
    readonly worktreePath?: string | null
  }) => {
    const hasTitle = value.title !== undefined
    const hasRegenerate = value.regenerateTitle === true
    const hasCheckout = value.branch !== undefined || value.worktreePath !== undefined
    if (hasTitle && hasRegenerate) {
      return false
    }
    return hasTitle || hasRegenerate || hasCheckout
  },
  {
    expected: "title, regenerateTitle, or a checkout field",
  },
)

const threadMetaPayload = Schema.Struct({
  threadId: ThreadId,
  title: Schema.optionalKey(Schema.NonEmptyString),
  regenerateTitle: Schema.optionalKey(Schema.Literal(true)),
  branch: Schema.optionalKey(ThreadBranch),
  worktreePath: Schema.optionalKey(ThreadWorktreePath),
}).check(exclusiveTitleIntent)

const threadRuntimeModePayload = {
  threadId: ThreadId,
  runtimeMode: RuntimeMode,
} as const

const threadModelSelectionPayload = {
  threadId: ThreadId,
  modelSelection: Schema.NullOr(ModelSelection),
} as const

const turnStartShared = {
  threadId: ThreadId,
  text: Schema.optionalKey(Schema.NonEmptyString),
  titleSeed: Schema.optionalKey(Schema.NonEmptyString),
  runtimeMode: Schema.optionalKey(RuntimeMode),
  modelSelection: Schema.optionalKey(Schema.NullOr(ModelSelection)),
  prepareWorktree: Schema.optionalKey(PrepareWorktree),
  presentation: Schema.optionalKey(TurnPresentation),
  image: Schema.optionalKey(Schema.Unknown),
  images: Schema.optionalKey(Schema.Unknown),
} as const

const turnStartRequestPayload = Schema.Struct({
  ...turnStartShared,
  attachments: Schema.optionalKey(TurnImageUploads),
}).check(turnPromptContent)

const turnStartCommandPayload = Schema.Struct({
  ...turnStartShared,
  attachments: Schema.optionalKey(TurnImageAttachments),
}).check(turnPromptContent)

const turnInterruptPayload = {
  threadId: ThreadId,
  turnId: Schema.optionalKey(TurnId),
} as const

const approvalRespondPayload = {
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  decision: ProviderApprovalDecision,
} as const

const userInputRespondPayload = {
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
} as const

export const ThreadCreateRequest = request("thread.create", Schema.Struct(threadCreatePayload))
export const ThreadArchiveRequest = request("thread.archive", Schema.Struct(threadIdPayload))
export const ThreadRestoreRequest = request("thread.restore", Schema.Struct(threadIdPayload))
export const ThreadMetaUpdateRequest = request("thread.meta.update", threadMetaPayload)
export const ThreadRuntimeModeSetRequest = request(
  "thread.runtime-mode.set",
  Schema.Struct(threadRuntimeModePayload),
)
export const ThreadModelSelectionSetRequest = request(
  "thread.model-selection.set",
  Schema.Struct(threadModelSelectionPayload),
)
export const ThreadTurnStartRequest = request("thread.turn.start", turnStartRequestPayload)
export const ThreadTurnInterruptRequest = request(
  "thread.turn.interrupt",
  Schema.Struct(turnInterruptPayload),
)
export const ApprovalRespondRequest = request(
  "approval.respond",
  Schema.Struct(approvalRespondPayload),
)
export const UserInputRespondRequest = request(
  "user-input.respond",
  Schema.Struct(userInputRespondPayload),
)
export const SessionStopRequest = request("session.stop", Schema.Struct(threadIdPayload))

export const ThreadCommandRequest = Schema.Union([
  ThreadCreateRequest,
  ThreadArchiveRequest,
  ThreadRestoreRequest,
  ThreadMetaUpdateRequest,
  ThreadRuntimeModeSetRequest,
  ThreadModelSelectionSetRequest,
  ThreadTurnStartRequest,
  ThreadTurnInterruptRequest,
  ApprovalRespondRequest,
  UserInputRespondRequest,
  SessionStopRequest,
])
export type ThreadCommandRequest = (typeof ThreadCommandRequest)["Type"]
export const decodeThreadCommandRequest = Schema.decodeUnknownEffect(ThreadCommandRequest)

export const ThreadCreate = command("thread.create", Schema.Struct(threadCreatePayload))
export const ThreadArchive = command("thread.archive", Schema.Struct(threadIdPayload))
export const ThreadRestore = command("thread.restore", Schema.Struct(threadIdPayload))
export const ThreadMetaUpdate = command("thread.meta.update", threadMetaPayload)
export const ThreadRuntimeModeSet = command(
  "thread.runtime-mode.set",
  Schema.Struct(threadRuntimeModePayload),
)
export const ThreadModelSelectionSet = command(
  "thread.model-selection.set",
  Schema.Struct(threadModelSelectionPayload),
)
export const ThreadTurnStart = command("thread.turn.start", turnStartCommandPayload)
export const ThreadTurnInterrupt = command(
  "thread.turn.interrupt",
  Schema.Struct(turnInterruptPayload),
)
export const ApprovalRespond = command("approval.respond", Schema.Struct(approvalRespondPayload))
export const UserInputRespond = command(
  "user-input.respond",
  Schema.Struct(userInputRespondPayload),
)
export const SessionStop = command("session.stop", Schema.Struct(threadIdPayload))

export const ClientThreadCommand = Schema.Union([
  ThreadCreate,
  ThreadArchive,
  ThreadRestore,
  ThreadMetaUpdate,
  ThreadRuntimeModeSet,
  ThreadModelSelectionSet,
  ThreadTurnStart,
  ThreadTurnInterrupt,
  ApprovalRespond,
  UserInputRespond,
  SessionStop,
])
export type ClientThreadCommand = (typeof ClientThreadCommand)["Type"]

const sessionSetPayload = {
  threadId: ThreadId,
  session: Session,
} as const

const transcriptAppendPayload = {
  item: TranscriptItem,
} as const

const turnEndedPayload = {
  threadId: ThreadId,
  turnId: TurnId,
  state: TurnSettlementState,
  lastError: Schema.optionalKey(Schema.NonEmptyString),
} as const

const titleSeededPayload = {
  threadId: ThreadId,
  title: Schema.NonEmptyString,
} as const

export const ThreadSessionSet = command("thread.session.set", Schema.Struct(sessionSetPayload))
export const ThreadTranscriptAppend = command(
  "thread.transcript.append",
  Schema.Struct(transcriptAppendPayload),
)
export const ThreadTurnEnded = command("thread.turn.ended", Schema.Struct(turnEndedPayload))
export const ThreadTitleSeeded = command("thread.title.seeded", Schema.Struct(titleSeededPayload))

export const InternalThreadCommand = Schema.Union([
  ThreadSessionSet,
  ThreadTranscriptAppend,
  ThreadTurnEnded,
  ThreadTitleSeeded,
])
export type InternalThreadCommand = (typeof InternalThreadCommand)["Type"]

export const ThreadCommand = Schema.Union([ClientThreadCommand, InternalThreadCommand])
export type ThreadCommand = (typeof ThreadCommand)["Type"]
