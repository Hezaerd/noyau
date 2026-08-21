import { ServiceUnavailable } from "@noyau/protocol/errors"
import { TicketId } from "@noyau/protocol/ids"
import { TicketDependencyCycle } from "@noyau/protocol/ticket/errors"
import { Cause } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  normalizeCause,
  ResourceSnapshotUnavailable,
  subscriptionEnded,
} from "../src/lib/app-failure"

const ticketId = TicketId.make("30000000-0000-4000-8000-000000000001")
const dependencyId = TicketId.make("30000000-0000-4000-8000-000000000002")

describe("AppFailure normalization", () => {
  it("preserves a typed domain rejection", () => {
    const rejection = new TicketDependencyCycle({ ticketId, dependsOnTicketId: dependencyId })

    expect(normalizeCause(Cause.fail(rejection), "command")).toEqual({
      _tag: "Rejected",
      rejection,
    })
  })

  it("distinguishes service availability from invalid local input", () => {
    expect(
      normalizeCause(Cause.fail(new ServiceUnavailable({ service: "sqlite" })), "command"),
    ).toEqual({ _tag: "Unavailable", service: "sqlite" })
    expect(normalizeCause(Cause.fail(new Error("unsafe details")), "input")).toEqual({
      _tag: "InvalidInput",
    })
  })

  it("turns protocol defects into incidents without exposing their cause", () => {
    const failure = normalizeCause(Cause.die(new Error("secret stack")), "command")

    expect(failure._tag).toBe("UnexpectedFailure")
    if (failure._tag === "UnexpectedFailure") {
      expect(failure.incidentId).toMatch(/^web-[a-z0-9]+$/u)
      expect(failure).not.toHaveProperty("cause")
    }
  })

  it("represents snapshot and stream completion as transport facts", () => {
    expect(
      normalizeCause(
        Cause.fail(new ResourceSnapshotUnavailable({ resource: "project" })),
        "snapshot",
      ),
    ).toEqual({ _tag: "TransportFailure", phase: "snapshot", reason: "ended" })
    expect(subscriptionEnded()).toEqual({
      _tag: "TransportFailure",
      phase: "stream",
      reason: "ended",
    })
  })
})
