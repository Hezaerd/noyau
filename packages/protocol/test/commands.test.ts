import { describe, expect, it } from "@effect/vitest"
import { Command, decodeTaskCommandRequest, TaskCommandRequest } from "@noyau/protocol/commands"
import { EventEnvelope } from "@noyau/protocol/events"
import { Effect, Schema } from "effect"

const decodeCommand = Schema.decodeUnknownSync(Command)
const encodeTaskCommandRequest = Schema.encodeSync(TaskCommandRequest)
const decodeEnvelope = Schema.decodeUnknownSync(EventEnvelope)

const meta = {
  commandId: "3f8f0d70-1111-4000-8000-000000000001",
  projectId: "3f8f0d70-1111-4000-8000-000000000002",
  actorId: "human:hezaerd",
  correlationId: "3f8f0d70-1111-4000-8000-000000000003",
  issuedAt: "2026-08-11T12:00:00.000Z",
  schemaVersion: 1,
}

describe("TaskCommandRequest", () => {
  it("décode et encode une request task.create publique", () => {
    const request = Effect.runSync(
      decodeTaskCommandRequest({
        _tag: "task.create",
        commandId: meta.commandId,
        causationId: "3f8f0d70-2222-4000-8000-000000000001",
        payload: {
          taskId: "3f8f0d70-1111-4000-8000-000000000004",
          missionId: "3f8f0d70-1111-4000-8000-000000000005",
          title: "Créer le schéma PostgreSQL",
          acceptanceCriteria: ["migrations reproductibles"],
        },
      }),
    )

    expect(encodeTaskCommandRequest(request)).toEqual({
      _tag: "task.create",
      commandId: meta.commandId,
      causationId: "3f8f0d70-2222-4000-8000-000000000001",
      payload: {
        taskId: "3f8f0d70-1111-4000-8000-000000000004",
        missionId: "3f8f0d70-1111-4000-8000-000000000005",
        title: "Créer le schéma PostgreSQL",
        acceptanceCriteria: ["migrations reproductibles"],
      },
    })
  })

  it("ne conserve aucune métadonnée possédée par le serveur", () => {
    const request = Effect.runSync(
      decodeTaskCommandRequest({
        _tag: "task.assign",
        commandId: meta.commandId,
        projectId: meta.projectId,
        actorId: meta.actorId,
        correlationId: meta.correlationId,
        issuedAt: meta.issuedAt,
        schemaVersion: meta.schemaVersion,
        payload: {
          taskId: "3f8f0d70-1111-4000-8000-000000000004",
          assigneeId: "agent:marion",
        },
      }),
    )

    expect(encodeTaskCommandRequest(request)).toEqual({
      _tag: "task.assign",
      commandId: meta.commandId,
      payload: {
        taskId: "3f8f0d70-1111-4000-8000-000000000004",
        assigneeId: "agent:marion",
      },
    })
  })

  it("rejette les commandes hors task.create et task.assign", () => {
    expect(() =>
      Effect.runSync(
        decodeTaskCommandRequest({
          _tag: "task.complete",
          commandId: meta.commandId,
          payload: {
            taskId: "3f8f0d70-1111-4000-8000-000000000004",
          },
        }),
      ),
    ).toThrow()
  })
})

describe("Command", () => {
  it("décode un task.create valide", () => {
    const command = decodeCommand({
      _tag: "task.create",
      ...meta,
      payload: {
        taskId: "3f8f0d70-1111-4000-8000-000000000004",
        missionId: "3f8f0d70-1111-4000-8000-000000000005",
        title: "Créer le schéma PostgreSQL",
        acceptanceCriteria: ["migrations reproductibles"],
      },
    })

    expect(command._tag).toBe("task.create")
    if (command._tag === "task.create") {
      expect(command.payload.title).toBe("Créer le schéma PostgreSQL")
    }
  })

  it("rejette un commandId qui n'est pas un UUID", () => {
    expect(() =>
      decodeCommand({
        _tag: "task.assign",
        ...meta,
        commandId: "pas-un-uuid",
        payload: {
          taskId: "3f8f0d70-1111-4000-8000-000000000004",
          assigneeId: "agent:marion",
        },
      }),
    ).toThrow()
  })

  it("rejette un tag de commande inconnu", () => {
    expect(() =>
      decodeCommand({
        _tag: "task.explode",
        ...meta,
        payload: { taskId: "3f8f0d70-1111-4000-8000-000000000004" },
      }),
    ).toThrow()
  })
})

describe("EventEnvelope", () => {
  it("décode un événement task.created persisté", () => {
    const envelope = decodeEnvelope({
      eventId: "3f8f0d70-2222-4000-8000-000000000001",
      projectId: meta.projectId,
      actorId: meta.actorId,
      correlationId: meta.correlationId,
      causationId: meta.commandId,
      occurredAt: "2026-08-11T12:00:00.001Z",
      schemaVersion: 1,
      event: {
        _tag: "task.created",
        taskId: "3f8f0d70-1111-4000-8000-000000000004",
        missionId: "3f8f0d70-1111-4000-8000-000000000005",
        title: "Créer le schéma PostgreSQL",
        acceptanceCriteria: [],
      },
    })

    expect(envelope.event._tag).toBe("task.created")
  })
})
