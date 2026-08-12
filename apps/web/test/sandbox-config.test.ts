import { describe, expect, it } from "vite-plus/test"

import { decodeSandboxConfig } from "../src/lib/sandbox-config"

describe("decodeSandboxConfig", () => {
  it("fournit un contexte sandbox stable sans configuration", () => {
    expect(decodeSandboxConfig({})).toEqual({
      apiBaseUrl: "",
      projectId: "10000000-0000-4000-8000-000000000001",
      missionId: "30000000-0000-4000-8000-000000000001",
      actorId: "human:sandbox",
    })
  })

  it("décode les overrides Vite", () => {
    expect(
      decodeSandboxConfig({
        VITE_NOYAU_API_BASE_URL: "https://noyau.test",
        VITE_NOYAU_PROJECT_ID: "10000000-0000-4000-8000-000000000009",
        VITE_NOYAU_MISSION_ID: "30000000-0000-4000-8000-000000000009",
        VITE_NOYAU_ACTOR_ID: "human:hezaerd",
      }),
    ).toEqual({
      apiBaseUrl: "https://noyau.test",
      projectId: "10000000-0000-4000-8000-000000000009",
      missionId: "30000000-0000-4000-8000-000000000009",
      actorId: "human:hezaerd",
    })
  })

  it("rejette un identifiant sandbox invalide", () => {
    expect(() =>
      decodeSandboxConfig({
        VITE_NOYAU_PROJECT_ID: "not-a-project-id",
      }),
    ).toThrow()
  })
})
