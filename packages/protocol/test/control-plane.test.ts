import { describe, expect, it } from "@effect/vitest"
import {
  ControlPlaneApi,
  EventCursor,
  ProjectEvent,
  ProjectEventStream,
} from "@noyau/protocol/control-plane"
import { Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"

const decodeCursor = Schema.decodeUnknownSync(EventCursor)
const encodeCursor = Schema.encodeSync(EventCursor)

describe("EventCursor", () => {
  it("décode et encode une valeur opaque non vide", () => {
    const encoded = "v1.eyJwcm9qZWN0Ijoib3BhcXVlIn0"

    expect(encodeCursor(decodeCursor(encoded))).toBe(encoded)
  })

  it("rejette un curseur vide", () => {
    expect(() => decodeCursor("")).toThrow()
  })
})

describe("ProjectEvent", () => {
  it("encode le curseur en id SSE et l'enveloppe en JSON", () => {
    const encoded = {
      id: "v1.opaque-project.42",
      event: "message" as const,
      data: JSON.stringify({
        eventId: "3f8f0d70-1111-4000-8000-000000000001",
        projectId: "3f8f0d70-1111-4000-8000-000000000002",
        actorId: "human:hezaerd",
        correlationId: "3f8f0d70-1111-4000-8000-000000000003",
        causationId: "3f8f0d70-1111-4000-8000-000000000004",
        occurredAt: "2026-08-12T12:00:00.000Z",
        schemaVersion: 1,
        event: {
          _tag: "task.assigned",
          taskId: "3f8f0d70-1111-4000-8000-000000000005",
          assigneeId: "agent:marion",
        },
      }),
    }

    const event = Schema.decodeSync(ProjectEvent)(encoded)

    expect(Schema.encodeSync(ProjectEvent)(event)).toEqual(encoded)
    expect(ProjectEventStream.sseMode).toBe("events")
  })
})

describe("ControlPlaneApi", () => {
  const spec = OpenApi.fromApi(ControlPlaneApi)

  it("expose exactement les cinq routes convenues", () => {
    expect(Object.keys(spec.paths).toSorted()).toEqual([
      "/api/v1/projects/{projectId}/commands",
      "/api/v1/projects/{projectId}/events",
      "/api/v1/projects/{projectId}/tasks",
      "/health/live",
      "/health/ready",
    ])
  })

  it("déclare le flux EventEnvelope en SSE avec deux sources de reprise optionnelles", () => {
    const operation = spec.paths["/api/v1/projects/{projectId}/events"]?.get
    const parameters =
      operation?.parameters?.filter(
        (parameter): parameter is Exclude<typeof parameter, { readonly $ref: string }> =>
          !("$ref" in parameter),
      ) ?? []

    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: "query", name: "cursor", required: false }),
        expect.objectContaining({ in: "header", name: "last-event-id", required: false }),
      ]),
    )
    expect(operation?.responses[200]?.content?.["text/event-stream"]).toBeDefined()
  })

  it("déclare les statuts typés de soumission de commande", () => {
    const operation = spec.paths["/api/v1/projects/{projectId}/commands"]?.post

    expect(Object.keys(operation?.responses ?? {}).toSorted()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "409",
      "503",
    ])
  })

  it("déclare les erreurs typées du flux et de la disponibilité", () => {
    const events = spec.paths["/api/v1/projects/{projectId}/events"]?.get
    const readiness = spec.paths["/health/ready"]?.get

    expect(Object.keys(events?.responses ?? {}).toSorted()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "503",
    ])
    expect(Object.keys(readiness?.responses ?? {}).toSorted()).toEqual(["200", "503"])
  })
})
