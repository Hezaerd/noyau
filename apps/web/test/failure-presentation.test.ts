import { ProjectId, TicketId } from "@noyau/protocol/ids"
import { ProjectUnavailable } from "@noyau/protocol/project/errors"
import { TicketDependencyCycle } from "@noyau/protocol/ticket/errors"
import { describe, expect, it } from "vite-plus/test"

import { invalidInputFailure, type AppFailure } from "../src/lib/app-failure"
import { presentFailure, type FailureContext } from "../src/lib/failure-presentation"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const ticketId = TicketId.make("30000000-0000-4000-8000-000000000001")
const dependencyId = TicketId.make("30000000-0000-4000-8000-000000000002")

const context = (patch: Partial<FailureContext> = {}): FailureContext => ({
  operation: "ticket.command",
  scope: "project",
  initiatedByUser: true,
  hasUsableData: true,
  ...patch,
})

describe("failure presentation policy", () => {
  it("keeps correctable input beside its form", () => {
    const presentation = presentFailure(
      invalidInputFailure("Le titre est requis."),
      context({ operation: "thread.turn.start", scope: "field" }),
    )

    expect(presentation).toMatchObject({
      surface: "inline",
      tone: "warning",
      title: "Le titre est requis.",
    })
  })

  it("turns a board rejection into one deduplicated toast", () => {
    const failure: AppFailure = {
      _tag: "Rejected",
      rejection: new TicketDependencyCycle({ ticketId, dependsOnTicketId: dependencyId }),
    }

    expect(presentFailure(failure, context())).toMatchObject({
      surface: "toast",
      title: "Cette dépendance créerait une boucle.",
      dedupeKey: "ticket.command:project",
    })
  })

  it("keeps a lost workspace visible until it is rebound", () => {
    const failure: AppFailure = {
      _tag: "Rejected",
      rejection: new ProjectUnavailable({ projectId }),
    }

    expect(presentFailure(failure, context({ initiatedByUser: false }))).toMatchObject({
      surface: "banner",
      persistence: "until-recovered",
      recovery: { action: "rebind", label: "Relier le dossier" },
    })
  })

  it("uses a banner with stale data and a page without initial data", () => {
    const failure: AppFailure = {
      _tag: "TransportFailure",
      phase: "stream",
      reason: "failed",
    }

    expect(presentFailure(failure, context({ initiatedByUser: false })).surface).toBe("banner")
    expect(
      presentFailure(failure, context({ initiatedByUser: false, hasUsableData: false })).surface,
    ).toBe("page")
  })

  it("keeps lifecycle interruption silent", () => {
    expect(
      presentFailure({ _tag: "Interrupted" }, context({ initiatedByUser: false })).surface,
    ).toBe("silent")
  })
})
