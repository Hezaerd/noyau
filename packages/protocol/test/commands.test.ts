import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"

import { Command } from "../src/commands"
import { EventEnvelope } from "../src/events"

const decodeCommand = Schema.decodeUnknownSync(Command)
const decodeEnvelope = Schema.decodeUnknownSync(EventEnvelope)

const meta = {
  commandId: "3f8f0d70-1111-4000-8000-000000000001",
  projectId: "3f8f0d70-1111-4000-8000-000000000002",
  actorId: "human:hezaerd",
  correlationId: "3f8f0d70-1111-4000-8000-000000000003",
  issuedAt: "2026-08-11T12:00:00.000Z",
  schemaVersion: 1,
}

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
