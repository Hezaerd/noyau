import { ServiceUnavailable } from "@noyau/contracts/errors"
import { FilePreviewFailed } from "@noyau/contracts/file-preview"
import { GitCommandError } from "@noyau/contracts/git"
import { PreviewTabId, TicketId, ThreadId } from "@noyau/contracts/ids"
import { PreviewTabNotFound, PreviewUrlInvalid } from "@noyau/contracts/preview"
import { TicketDependencyCycle } from "@noyau/contracts/ticket/errors"
import { Cause } from "effect"
import { describe, expect, it } from "vite-plus/test"

import {
  invalidInputFailure,
  isTransportReplacementFailure,
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
    expect(
      normalizeCause(Cause.fail(new FilePreviewFailed({ reason: "outside-workspace" })), "command"),
    ).toEqual({ _tag: "InvalidInput" })
    expect(
      normalizeCause(
        Cause.fail(new GitCommandError({ operation: "git.rev-parse", detail: "ENOENT" })),
        "stream",
      ),
    ).toEqual({ _tag: "InvalidInput", message: "ENOENT" })
    expect(
      normalizeCause(
        Cause.fail(
          new PreviewUrlInvalid({
            threadId: ThreadId.make("20000000-0000-4000-8000-000000000001"),
          }),
        ),
        "command",
      ),
    ).toEqual({ _tag: "InvalidInput", message: "Enter a valid URL." })
    expect(
      normalizeCause(
        Cause.fail(
          new PreviewTabNotFound({
            threadId: ThreadId.make("20000000-0000-4000-8000-000000000001"),
            tabId: PreviewTabId.make("aaaaaaaa-0000-4000-8000-000000000001"),
          }),
        ),
        "command",
      ),
    ).toEqual({ _tag: "InvalidInput", message: "This browser tab is no longer open." })
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

  it("replaces the shared transport only for socket-level failures", () => {
    expect(isTransportReplacementFailure(subscriptionEnded())).toBe(true)
    expect(
      isTransportReplacementFailure({
        _tag: "TransportFailure",
        phase: "stream",
        reason: "failed",
      }),
    ).toBe(true)
    expect(isTransportReplacementFailure({ _tag: "UnexpectedFailure", incidentId: "web-1" })).toBe(
      true,
    )
    expect(isTransportReplacementFailure(invalidInputFailure("fatal: not a git repository"))).toBe(
      false,
    )
    expect(isTransportReplacementFailure({ _tag: "Unavailable", service: "sqlite" })).toBe(false)
  })
})
