import { TaskStatus } from "@noyau/protocol/entities/task"
import { ActorId, TaskId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export class TaskAlreadyExists extends Schema.TaggedError<TaskAlreadyExists>()(
  "TaskAlreadyExists",
  {
    taskId: TaskId,
  },
) {}

export class TaskNotFound extends Schema.TaggedError<TaskNotFound>()("TaskNotFound", {
  taskId: TaskId,
}) {}

export class InvalidTaskTransition extends Schema.TaggedError<InvalidTaskTransition>()(
  "InvalidTaskTransition",
  {
    taskId: TaskId,
    status: TaskStatus,
    commandTag: Schema.String,
  },
) {}

export class TaskAlreadyAssigned extends Schema.TaggedError<TaskAlreadyAssigned>()(
  "TaskAlreadyAssigned",
  {
    taskId: TaskId,
    assigneeId: ActorId,
  },
) {}
