import { ActorId, MissionId, TaskId } from "@noyau/protocol/ids"
import { describe, expect, it } from "vite-plus/test"

import { buildTaskAssignRequest, buildTaskCreateRequest } from "../src/lib/task-commands"

const missionId = MissionId.make("30000000-0000-4000-8000-000000000001")

describe("buildTaskCreateRequest", () => {
  it("normalise le brouillon et omet une description vide", () => {
    const request = buildTaskCreateRequest(
      {
        title: "  Brancher le control plane  ",
        description: "   ",
        acceptanceCriteria: [" snapshot affiché ", "", " assignation durable "],
      },
      missionId,
      {
        commandId: "40000000-0000-4000-8000-000000000001",
        taskId: "20000000-0000-4000-8000-000000000001",
      },
    )

    expect(request).toEqual({
      _tag: "task.create",
      commandId: "40000000-0000-4000-8000-000000000001",
      payload: {
        taskId: "20000000-0000-4000-8000-000000000001",
        missionId,
        title: "Brancher le control plane",
        acceptanceCriteria: ["snapshot affiché", "assignation durable"],
      },
    })
  })

  it("rejette un brouillon sans critère d'acceptation", () => {
    expect(() =>
      buildTaskCreateRequest(
        {
          title: "Tâche non bornée",
          description: "",
          acceptanceCriteria: ["  "],
        },
        missionId,
        {
          commandId: "40000000-0000-4000-8000-000000000002",
          taskId: "20000000-0000-4000-8000-000000000002",
        },
      ),
    ).toThrow()
  })
})

describe("buildTaskAssignRequest", () => {
  it("construit une assignation vers l'acteur actif", () => {
    const request = buildTaskAssignRequest(
      TaskId.make("20000000-0000-4000-8000-000000000001"),
      ActorId.make("human:sandbox"),
      "40000000-0000-4000-8000-000000000003",
    )

    expect(request.payload.assigneeId).toBe("human:sandbox")
  })
})
