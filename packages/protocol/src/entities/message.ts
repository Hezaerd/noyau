import {
  ActorId,
  AgentRunId,
  CorrelationId,
  MessageId,
  MissionId,
  ProjectId,
  TaskId,
  ThreadId,
} from "@noyau/protocol/ids"
import { Schema } from "effect"

export const MessageKind = Schema.Literals(["message", "question", "report", "decision", "alert"])
export type MessageKind = (typeof MessageKind)["Type"]

export class Message extends Schema.Class<Message>("@noyau/protocol/entities/Message")({
  id: MessageId,
  threadId: ThreadId,
  projectId: ProjectId,
  authorId: ActorId,
  kind: MessageKind,
  body: Schema.NonEmptyString,
  replyTo: Schema.optionalKey(MessageId),
  correlationId: Schema.optionalKey(CorrelationId),
  missionId: Schema.optionalKey(MissionId),
  taskId: Schema.optionalKey(TaskId),
  runId: Schema.optionalKey(AgentRunId),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
