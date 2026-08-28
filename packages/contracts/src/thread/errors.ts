import { ApprovalRequestId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { Schema } from "effect"

export class ThreadAlreadyExists extends Schema.TaggedError<ThreadAlreadyExists>()(
  "ThreadAlreadyExists",
  { threadId: ThreadId },
) {}

export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()("ThreadNotFound", {
  threadId: ThreadId,
}) {}

export class ThreadArchived extends Schema.TaggedError<ThreadArchived>()("ThreadArchived", {
  threadId: ThreadId,
}) {}

export class ThreadNotSettleable extends Schema.TaggedError<ThreadNotSettleable>()(
  "ThreadNotSettleable",
  {
    threadId: ThreadId,
  },
) {}

export class TurnAlreadyActive extends Schema.TaggedError<TurnAlreadyActive>()(
  "TurnAlreadyActive",
  {
    threadId: ThreadId,
    turnId: TurnId,
  },
) {}

export class TurnNotFound extends Schema.TaggedError<TurnNotFound>()("TurnNotFound", {
  threadId: ThreadId,
  turnId: TurnId,
}) {}

export class ImageAttachmentRejected extends Schema.TaggedError<ImageAttachmentRejected>()(
  "ImageAttachmentRejected",
  { threadId: ThreadId },
) {}

export class ApprovalRequestNotFound extends Schema.TaggedError<ApprovalRequestNotFound>()(
  "ApprovalRequestNotFound",
  {
    threadId: ThreadId,
    requestId: ApprovalRequestId,
  },
) {}

export class SessionNotRunning extends Schema.TaggedError<SessionNotRunning>()(
  "SessionNotRunning",
  {
    threadId: ThreadId,
  },
) {}

export const ThreadRejection = Schema.Union([
  ThreadAlreadyExists,
  ThreadNotFound,
  ThreadArchived,
  ThreadNotSettleable,
  TurnAlreadyActive,
  TurnNotFound,
  ImageAttachmentRejected,
  ApprovalRequestNotFound,
  SessionNotRunning,
])
export type ThreadRejection = (typeof ThreadRejection)["Type"]
