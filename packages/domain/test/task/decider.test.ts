import { describe, expect, it } from "@effect/vitest"
import { decide } from "@noyau/domain/task/decider"
import { Result } from "effect"

import {
  assignCommand,
  completeCommand,
  createCommand,
  failCommand,
  marion,
  stateWith,
  taskId,
} from "./fixtures"

const expectSuccess = <A, E>(result: Result.Result<A, E>): A => {
  expect(Result.isSuccess(result)).toBe(true)
  if (!Result.isSuccess(result)) {
    throw new Error("unreachable")
  }
  return result.success
}

const expectFailure = <A, E>(result: Result.Result<A, E>): E => {
  expect(Result.isFailure(result)).toBe(true)
  if (!Result.isFailure(result)) {
    throw new Error("unreachable")
  }
  return result.failure
}

describe("decide task.create", () => {
  it("produit task.created sur un état vide", () => {
    const events = expectSuccess(decide(undefined, createCommand))
    expect(events).toHaveLength(1)
    expect(events[0]?._tag).toBe("task.created")
  })

  it("échoue si la tâche existe déjà", () => {
    const error = expectFailure(decide(stateWith("proposed"), createCommand))
    expect(error._tag).toBe("TaskAlreadyExists")
  })
})

describe("decide task.assign", () => {
  it("assigne une tâche proposée", () => {
    const events = expectSuccess(decide(stateWith("proposed"), assignCommand))
    expect(events[0]?._tag).toBe("task.assigned")
    if (events[0]?._tag === "task.assigned") {
      expect(events[0].assigneeId).toBe(marion)
    }
  })

  it("échoue sur une tâche inconnue", () => {
    const error = expectFailure(decide(undefined, assignCommand))
    expect(error._tag).toBe("TaskNotFound")
  })

  it("refuse d'assigner une tâche en cours", () => {
    const error = expectFailure(decide(stateWith("running"), assignCommand))
    expect(error._tag).toBe("InvalidTaskTransition")
    if (error._tag === "InvalidTaskTransition") {
      expect(error.status).toBe("running")
      expect(error.taskId).toBe(taskId)
    }
  })
})

describe("decide task.complete", () => {
  it("complète une tâche en vérification", () => {
    const events = expectSuccess(decide(stateWith("verifying"), completeCommand))
    expect(events[0]?._tag).toBe("task.completed")
  })

  it("refuse de compléter une tâche seulement proposée", () => {
    const error = expectFailure(decide(stateWith("proposed"), completeCommand))
    expect(error._tag).toBe("InvalidTaskTransition")
  })
})

describe("decide task.fail", () => {
  it("fait échouer une tâche en cours", () => {
    const events = expectSuccess(decide(stateWith("running"), failCommand))
    expect(events[0]?._tag).toBe("task.failed")
  })

  it("refuse de faire échouer une tâche déjà complétée", () => {
    const error = expectFailure(decide(stateWith("completed"), failCommand))
    expect(error._tag).toBe("InvalidTaskTransition")
  })
})
