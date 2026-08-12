import type { TaskAssign, TaskComplete, TaskCreate, TaskFail } from "@noyau/protocol/commands"
import type { TaskStatus } from "@noyau/protocol/entities/task"
import type { TaskEvent } from "@noyau/protocol/events"
import { TaskAssigned, TaskCompleted, TaskCreated, TaskFailed } from "@noyau/protocol/events"
import type { ActorId } from "@noyau/protocol/ids"
import type { TaskId } from "@noyau/protocol/ids"
import {
  InvalidTaskTransition,
  TaskAlreadyAssigned,
  TaskAlreadyExists,
  TaskNotFound,
} from "@noyau/protocol/task/errors"
import { Result } from "effect"

export {
  InvalidTaskTransition,
  TaskAlreadyAssigned,
  TaskAlreadyExists,
  TaskNotFound,
} from "@noyau/protocol/task/errors"

/** État minimal nécessaire pour décider — pas la projection complète. */
export interface TaskState {
  readonly taskId: TaskId
  readonly status: TaskStatus
  readonly assigneeId?: ActorId
}

export type TaskCommand = TaskCreate | TaskAssign | TaskComplete | TaskFail

export type TaskDecisionError =
  | TaskAlreadyExists
  | TaskNotFound
  | InvalidTaskTransition
  | TaskAlreadyAssigned

const assignableFrom: ReadonlyArray<TaskStatus> = ["proposed", "ready"]
const completableFrom: ReadonlyArray<TaskStatus> = ["running", "verifying"]
const failableFrom: ReadonlyArray<TaskStatus> = [
  "leased",
  "running",
  "waiting_human",
  "waiting_agent",
  "verifying",
]

const requireTransition = (
  state: TaskState,
  allowed: ReadonlyArray<TaskStatus>,
  commandTag: string,
): Result.Result<TaskState, InvalidTaskTransition> =>
  allowed.includes(state.status)
    ? Result.succeed(state)
    : Result.fail(
        new InvalidTaskTransition({ taskId: state.taskId, status: state.status, commandTag }),
      )

/**
 * Decider pur : aucune IO, aucun UUID, aucune horloge. Produit des faits que
 * le control plane enveloppera et persistera dans la même transaction.
 */
export const decide = (
  state: TaskState | undefined,
  command: TaskCommand,
): Result.Result<ReadonlyArray<TaskEvent>, TaskDecisionError> => {
  switch (command._tag) {
    case "task.create": {
      if (state !== undefined) {
        return Result.fail(new TaskAlreadyExists({ taskId: command.payload.taskId }))
      }
      return Result.succeed([TaskCreated.make(command.payload)])
    }
    case "task.assign": {
      if (state === undefined) {
        return Result.fail(new TaskNotFound({ taskId: command.payload.taskId }))
      }
      return requireTransition(state, assignableFrom, command._tag).pipe(
        Result.flatMap(() =>
          state.assigneeId === undefined
            ? Result.succeed([
                TaskAssigned.make({
                  taskId: command.payload.taskId,
                  assigneeId: command.payload.assigneeId,
                }),
              ])
            : Result.fail(
                new TaskAlreadyAssigned({
                  taskId: command.payload.taskId,
                  assigneeId: state.assigneeId,
                }),
              ),
        ),
      )
    }
    case "task.complete": {
      if (state === undefined) {
        return Result.fail(new TaskNotFound({ taskId: command.payload.taskId }))
      }
      return requireTransition(state, completableFrom, command._tag).pipe(
        Result.map(() => [TaskCompleted.make(command.payload)]),
      )
    }
    case "task.fail": {
      if (state === undefined) {
        return Result.fail(new TaskNotFound({ taskId: command.payload.taskId }))
      }
      return requireTransition(state, failableFrom, command._tag).pipe(
        Result.map(() => [TaskFailed.make(command.payload)]),
      )
    }
  }
}
