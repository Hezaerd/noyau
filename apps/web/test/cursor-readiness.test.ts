import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"
import { describe, expect, it } from "vite-plus/test"

import { isCursorReady, resolveCursorReadiness } from "../src/lib/cursor-readiness"
import {
  presentCodexPlan,
  presentCursorConnection,
  presentCursorPlan,
  presentCursorVersion,
} from "../src/lib/providers-catalog"

const cursorStatus = (
  installed: boolean,
  handshakeOk: boolean,
  extras: Partial<Pick<CursorProviderStatus, "version" | "plan" | "binaryPath">> = {},
): CursorProviderStatus => ({
  installed,
  handshakeOk,
  version: extras.version ?? null,
  plan: extras.plan ?? null,
  binaryPath: extras.binaryPath ?? null,
})

describe("cursor readiness", () => {
  it("treats a missing Environment status as unknown, not ready", () => {
    expect(resolveCursorReadiness(undefined)).toBe("unknown")
    expect(isCursorReady(undefined)).toBe(false)
  })

  it("requires both PATH detection and handshake ACP", () => {
    expect(resolveCursorReadiness(cursorStatus(false, false))).toBe("not-installed")
    expect(resolveCursorReadiness(cursorStatus(true, false))).toBe("handshake-failed")
    expect(resolveCursorReadiness(cursorStatus(true, true))).toBe("ready")
    expect(isCursorReady(cursorStatus(true, true))).toBe(true)
  })
})

describe("provider connection copy", () => {
  it("maps Cursor readiness to a headline, PATH/handshake detail, and status dot", () => {
    expect(presentCursorConnection(undefined)).toMatchObject({
      headline: "Lecture du statut…",
      detail: null,
      statusDot: "unknown",
    })
    expect(presentCursorConnection(cursorStatus(true, true))).toEqual({
      headline: "Disponible",
      detail: "PATH · handshake OK",
      statusDot: "ready",
    })
    expect(presentCursorConnection(cursorStatus(false, false))).toEqual({
      headline: "CLI introuvable",
      detail: "Absent du PATH",
      statusDot: "warning",
    })
    expect(presentCursorConnection(cursorStatus(true, false))).toEqual({
      headline: "Handshake échoué",
      detail: "Détecté dans le PATH",
      statusDot: "error",
    })
  })

  it("prefixes the Cursor CLI version and never surfaces email", () => {
    expect(presentCursorVersion("2026.04.09-f2b0fcd")).toBe("v2026.04.09-f2b0fcd")
    expect(presentCursorVersion("v1.2.3")).toBe("v1.2.3")
    expect(presentCursorVersion(null)).toBeNull()
    expect(Object.keys(cursorStatus(true, true, { version: "1", plan: "Pro" }))).not.toContain(
      "userEmail",
    )
  })

  it("renders the Cursor plan without inventing an email", () => {
    expect(presentCursorPlan("Pro")).toBe("Cursor Pro")
    expect(presentCursorPlan("Cursor Ultra Subscription")).toBe("Cursor Ultra Subscription")
    expect(presentCursorPlan(null)).toBeNull()
  })

  it("renders the Codex plan without inventing an email", () => {
    expect(presentCodexPlan("plus")).toBe("Codex plus")
    expect(presentCodexPlan("Codex Pro")).toBe("Codex Pro")
    expect(presentCodexPlan(null)).toBeNull()
  })
})
