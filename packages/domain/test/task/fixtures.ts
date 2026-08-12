import type { TaskState } from "@noyau/domain/task/decider"
import { TaskAssign, TaskComplete, TaskCreate, TaskFail } from "@noyau/protocol/commands"
import {
  ActorId,
  CommandId,
  CorrelationId,
  MissionId,
  ProjectId,
  TaskId,
} from "@noyau/protocol/ids"
import { DateTime } from "effect"

export const taskId = TaskId.make("3f8f0d70-1111-4000-8000-000000000010")
export const missionId = MissionId.make("3f8f0d70-1111-4000-8000-000000000011")
export const marion = ActorId.make("agent:marion")
export const hermes = ActorId.make("agent:hermes")

const meta = {
  commandId: CommandId.make("3f8f0d70-1111-4000-8000-000000000001"),
  projectId: ProjectId.make("3f8f0d70-1111-4000-8000-000000000002"),
  actorId: ActorId.make("human:hezaerd"),
  correlationId: CorrelationId.make("3f8f0d70-1111-4000-8000-000000000003"),
  issuedAt: DateTime.makeUnsafe("2026-08-11T12:00:00.000Z"),
  schemaVersion: 1,
} as const

export const createCommand = TaskCreate.make({
  ...meta,
  payload: {
    taskId,
    missionId,
    title: "Créer le schéma PostgreSQL",
    acceptanceCriteria: ["migrations reproductibles"],
  },
})

export const assignCommandTo = (assigneeId: ActorId) =>
  TaskAssign.make({
    ...meta,
    payload: { taskId, assigneeId },
  })

export const assignCommand = assignCommandTo(marion)

export const completeCommand = TaskComplete.make({
  ...meta,
  payload: { taskId, summary: "Schéma livré" },
})

export const failCommand = TaskFail.make({
  ...meta,
  payload: { taskId, reason: "Tests rouges" },
})

export const stateWith = (status: TaskState["status"], assigneeId?: ActorId): TaskState =>
  assigneeId === undefined ? { taskId, status } : { taskId, status, assigneeId }
