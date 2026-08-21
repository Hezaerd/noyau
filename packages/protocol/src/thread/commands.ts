import {
  ProviderApprovalDecision,
  ProviderUserInputAnswers,
} from "@noyau/protocol/entities/approvals"
import { ModelSelection } from "@noyau/protocol/entities/model-selection"
import { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { Session } from "@noyau/protocol/entities/session"
import { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { TurnSettlementState } from "@noyau/protocol/entities/turn"
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

const noImageAttachments = Schema.makeFilter(
  (value: {
    readonly attachments?: unknown
    readonly image?: unknown
    readonly images?: unknown
  }) => value.attachments === undefined && value.image === undefined && value.images === undefined,
  {
    expected: "a text-only prompt; image attachments are rejected in v0.1",
  },
)

const threadCreatePayload = {
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  runtimeMode: Schema.optionalKey(RuntimeMode),
  modelSelection: Schema.optionalKey(ModelSelection),
} as const

const threadIdPayload = {
  threadId: ThreadId,
} as const

const exclusiveTitleIntent = Schema.makeFilter(
  (value: { readonly title?: string; readonly regenerateTitle?: true }) =>
    (value.title !== undefined) !== (value.regenerateTitle === true),
  {
    expected: "exactly one of title or regenerateTitle",
  },
)

const threadMetaPayload = Schema.Struct({
  threadId: ThreadId,
  title: Schema.optionalKey(Schema.NonEmptyString),
  regenerateTitle: Schema.optionalKey(Schema.Literal(true)),
}).check(exclusiveTitleIntent)

const threadRuntimeModePayload = {
  threadId: ThreadId,
  runtimeMode: RuntimeMode,
} as const

const turnStartPayload = Schema.Struct({
  threadId: ThreadId,
  text: Schema.NonEmptyString,
  titleSeed: Schema.optionalKey(Schema.NonEmptyString),
  runtimeMode: Schema.optionalKey(RuntimeMode),
  modelSelection: Schema.optionalKey(Schema.NullOr(ModelSelection)),
  attachments: Schema.optionalKey(Schema.Unknown),
  image: Schema.optionalKey(Schema.Unknown),
  images: Schema.optionalKey(Schema.Unknown),
}).check(noImageAttachments)

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
export const ThreadTurnStartRequest = request("thread.turn.start", turnStartPayload)
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
export const ThreadTurnStart = command("thread.turn.start", turnStartPayload)
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
