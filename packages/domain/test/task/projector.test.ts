import { describe, expect, it } from "@effect/vitest"
import { TaskAssigned, TaskCompleted, TaskCreated, TaskFailed } from "@noyau/protocol/events"

import { evolve, replay } from "../../src/task/projector"
import { marion, missionId, taskId } from "./fixtures"

const created = TaskCreated.make({
  taskId,
  missionId,
  title: "Créer le schéma PostgreSQL",
  acceptanceCriteria: [],
})

describe("evolve", () => {
  it("task.created initialise l'état en proposed", () => {
    expect(evolve(undefined, created)).toEqual({ taskId, status: "proposed" })
  })

  it("ignore un événement sur un état absent", () => {
    expect(evolve(undefined, TaskCompleted.make({ taskId }))).toBeUndefined()
  })
})

describe("replay", () => {
  it("reconstruit l'état final depuis le journal", () => {
    const state = replay([
      created,
      TaskAssigned.make({ taskId, assigneeId: marion }),
      TaskCompleted.make({ taskId, summary: "Schéma livré" }),
    ])

    expect(state).toEqual({ taskId, status: "completed", assigneeId: marion })
  })

  it("un échec après assignation laisse la tâche en failed", () => {
    const state = replay([
      created,
      TaskAssigned.make({ taskId, assigneeId: marion }),
      TaskFailed.make({ taskId, reason: "Tests rouges" }),
    ])

    expect(state?.status).toBe("failed")
  })
})
