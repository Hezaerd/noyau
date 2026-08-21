import { describe, expect, it } from "@effect/vitest"
import {
  CursorProviderStatus,
  emptyCursorProviderStatus,
  WorkspaceRoot,
} from "@noyau/protocol/entities/environment"
import { ProjectCommand, ProjectCreateRequest } from "@noyau/protocol/project/commands"
import { Schema } from "effect"

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  command: "20000000-0000-4000-8000-000000000001",
  correlation: "30000000-0000-4000-8000-000000000001",
  backlog: "40000000-0000-4000-8000-000000000001",
  active: "40000000-0000-4000-8000-000000000002",
  done: "40000000-0000-4000-8000-000000000003",
} as const

describe("WorkspaceRoot", () => {
  it("accepte les chemins absolus POSIX, Windows et UNC", () => {
    const decode = Schema.decodeSync(WorkspaceRoot)

    expect(decode("/Users/hezaerd/noyau")).toBe("/Users/hezaerd/noyau")
    expect(decode("C:\\Users\\hezaerd\\noyau")).toBe("C:\\Users\\hezaerd\\noyau")
    expect(decode("\\\\server\\share\\noyau")).toBe("\\\\server\\share\\noyau")
  })

  it("rejette les chemins relatifs dans les requests Project", () => {
    expect(() =>
      Schema.decodeSync(ProjectCreateRequest)({
        _tag: "project.create",
        commandId: ids.command,
        payload: {
          projectId: ids.project,
          name: "Noyau",
          workspaceRoot: "./noyau",
        },
      }),
    ).toThrow()
  })
})

describe("project.create enrichment", () => {
  it("porte les identités du board uniquement dans la commande enrichie", () => {
    const decoded = Schema.decodeSync(ProjectCommand)({
      _tag: "project.create",
      commandId: ids.command,
      projectId: ids.project,
      actorId: "system",
      correlationId: ids.correlation,
      issuedAt: "2026-08-20T00:00:00.000Z",
      schemaVersion: 1,
      payload: {
        projectId: ids.project,
        name: "Noyau",
        workspaceRoot: "/workspace",
      },
      initialBoard: {
        backlogColumnId: ids.backlog,
        activeColumnId: ids.active,
        doneColumnId: ids.done,
      },
    })

    expect(decoded._tag).toBe("project.create")
    if (decoded._tag !== "project.create") {
      throw new Error("Expected project.create")
    }
    expect(decoded.initialBoard).toEqual({
      backlogColumnId: ids.backlog,
      activeColumnId: ids.active,
      doneColumnId: ids.done,
    })
    expect(ProjectCreateRequest.fields).not.toHaveProperty("initialBoard")
  })
})

describe("CursorProviderStatus", () => {
  it("préserve les options dynamiques et les valeurs par défaut de chaque modèle", () => {
    const decoded = Schema.decodeSync(CursorProviderStatus)({
      installed: true,
      handshakeOk: true,
      version: null,
      plan: null,
      binaryPath: null,
      models: [
        {
          modelId: "composer-2.5",
          label: "Composer 2.5",
          reasoningEfforts: [
            { value: "medium", label: "Medium", isDefault: true },
            { value: "high", label: "High" },
          ],
          serviceTiers: [
            { value: "normal", label: "Normal", isDefault: true },
            {
              value: "fast",
              label: "Fast",
              description: "1.5x speed, increased usage",
            },
          ],
          thinking: { label: "Réflexion", defaultValue: true },
        },
      ],
    })

    expect(decoded.models?.[0]?.reasoningEfforts[0]?.isDefault).toBe(true)
    expect(decoded.models?.[0]?.serviceTiers[1]?.description).toBe("1.5x speed, increased usage")
    expect(decoded.models?.[0]?.thinking?.defaultValue).toBe(true)
  })

  it("décode version, plan et binaryPath, et ignore un email", () => {
    const decoded = Schema.decodeUnknownSync(CursorProviderStatus)({
      installed: true,
      handshakeOk: true,
      version: "2026.04.09-f2b0fcd",
      plan: "Team",
      binaryPath: "/usr/local/bin/cursor-agent",
      userEmail: "secret@example.com",
    })

    expect(decoded).toEqual({
      installed: true,
      handshakeOk: true,
      version: "2026.04.09-f2b0fcd",
      plan: "Team",
      binaryPath: "/usr/local/bin/cursor-agent",
    })
    expect(decoded).not.toHaveProperty("userEmail")
  })

  it("fournit un statut inactif sans CLI", () => {
    expect(emptyCursorProviderStatus).toEqual({
      installed: false,
      handshakeOk: false,
      version: null,
      plan: null,
      binaryPath: null,
      models: [],
    })
  })
})
