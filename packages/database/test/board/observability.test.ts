import { assert, describe, it } from "@effect/vitest"
import { commandOutcome, commandsTotal, observeCommand } from "@noyau/database/board/observability"
import { CommandIdConflict, InvalidCausation } from "@noyau/protocol/errors"
import { CommandId, EventId, TicketId } from "@noyau/protocol/ids"
import type { TicketReceipt } from "@noyau/protocol/receipts"
import { TicketNotFound } from "@noyau/protocol/ticket/errors"
import { Cause, Effect, Exit, Metric } from "effect"

const commandId = CommandId.make("eeeeeeee-0000-4000-8000-000000000001")
const eventId = EventId.make("ffffffff-0000-4000-8000-000000000001")

const accepted: TicketReceipt = {
  commandId,
  response: { _tag: "accepted", eventIds: [] },
}

const rejected: TicketReceipt = {
  commandId,
  response: {
    _tag: "rejected",
    error: new TicketNotFound({
      ticketId: TicketId.make("cccccccc-0000-4000-8000-000000000001"),
    }),
  },
}

const hasCounter = (
  snapshots: ReadonlyArray<Metric.Metric.Snapshot>,
  commandType: string,
  outcome: string,
) =>
  snapshots.some(
    (snapshot) =>
      snapshot.id === commandsTotal.id &&
      snapshot.attributes?.commandType === commandType &&
      snapshot.attributes?.outcome === outcome,
  )

describe("command observability", () => {
  it("mappe les receipts et erreurs attendues vers un outcome borné", () => {
    assert.strictEqual(commandOutcome(Exit.succeed(accepted)), "accepted")
    assert.strictEqual(commandOutcome(Exit.succeed(rejected)), "rejected")
    assert.strictEqual(commandOutcome(Exit.fail(new CommandIdConflict({ commandId }))), "conflict")
    assert.strictEqual(
      commandOutcome(Exit.fail(new InvalidCausation({ causationId: eventId }))),
      "invalid_causation",
    )
    assert.strictEqual(commandOutcome(Exit.fail("sql")), "failure")
    assert.strictEqual(commandOutcome(Exit.failCause(Cause.interrupt())), "interrupt")
  })

  it.effect("compte une commande acceptée sans identifiant", () =>
    Effect.gen(function* () {
      const registry = new Map()
      yield* observeCommand("ticket.create", Effect.succeed(accepted)).pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
      )
      const snapshots = yield* Metric.snapshot.pipe(
        Effect.provideService(Metric.MetricRegistry, registry),
      )
      assert.ok(hasCounter(snapshots, "ticket.create", "accepted"))
      assert.ok(
        snapshots.every(
          (snapshot) =>
            snapshot.attributes?.commandId === undefined &&
            snapshot.attributes?.projectId === undefined,
        ),
      )
    }),
  )
})
