import { ActorId, MissionId, ProjectId, TaskId } from "@noyau/protocol/ids"
import { Schema } from "effect"

/**
 * Cycle de vie d'une tâche :
 * proposed -> ready -> leased -> running
 *                               |- waiting_human
 *                               |- waiting_agent
 *                               |- verifying -> completed
 *                               `- failed / cancelled
 */
export const TaskStatus = Schema.Literals([
  "proposed",
  "ready",
  "leased",
  "running",
  "waiting_human",
  "waiting_agent",
  "verifying",
  "completed",
  "failed",
  "cancelled",
])
export type TaskStatus = (typeof TaskStatus)["Type"]

export class Task extends Schema.Class<Task>("@noyau/protocol/entities/Task")({
  id: TaskId,
  missionId: MissionId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  acceptanceCriteria: Schema.Array(Schema.NonEmptyString),
  status: TaskStatus,
  assigneeId: Schema.optionalKey(ActorId),
  createdAt: Schema.DateTimeUtcFromString,
}) {}
