import { TaskAssignRequest, TaskCreateRequest } from "@noyau/protocol/commands"
import type { ActorId, MissionId, TaskId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export interface TaskDraft {
  readonly title: string
  readonly description: string
  readonly acceptanceCriteria: ReadonlyArray<string>
}

export interface TaskCreateIds {
  readonly commandId: string
  readonly taskId: string
}

const decodeTaskCreateRequest = Schema.decodeUnknownSync(TaskCreateRequest)
const decodeTaskAssignRequest = Schema.decodeUnknownSync(TaskAssignRequest)

export const buildTaskCreateRequest = (
  draft: TaskDraft,
  missionId: MissionId,
  ids: TaskCreateIds,
) => {
  const title = draft.title.trim()
  const description = draft.description.trim()
  const acceptanceCriteria = draft.acceptanceCriteria
    .map((criterion) => criterion.trim())
    .filter(Boolean)

  return decodeTaskCreateRequest({
    _tag: "task.create",
    commandId: ids.commandId,
    payload: {
      taskId: ids.taskId,
      missionId,
      title,
      acceptanceCriteria,
      ...(description === "" ? {} : { description }),
    },
  })
}

export const buildTaskAssignRequest = (taskId: TaskId, assigneeId: ActorId, commandId: string) =>
  decodeTaskAssignRequest({
    _tag: "task.assign",
    commandId,
    payload: { taskId, assigneeId },
  })
