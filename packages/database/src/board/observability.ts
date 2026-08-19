import type { TicketReceipt } from "@noyau/protocol/receipts"
import { Cause, Clock, Duration, Effect, Exit, Metric, Option, Predicate } from "effect"

/** Span de la transaction durable d'une commande Tableau. */
export const commandExecuteSpan = "command.execute"

/** Span de lecture du BoardSnapshot. */
export const boardSnapshotReadSpan = "board.snapshot.read"

/** Span de lecture de l'activité Ticket. */
export const ticketActivityReadSpan = "ticket.activity.read"

export const commandsTotal = Metric.counter("noyau_commands_total", {
  description: "Commandes Tableau exécutées, par type et outcome borné.",
})

export const commandDuration = Metric.timer("noyau_command_duration", {
  description: "Durée d'exécution d'une commande Tableau.",
})

export type CommandOutcome =
  | "accepted"
  | "rejected"
  | "conflict"
  | "invalid_causation"
  | "failure"
  | "interrupt"

export const commandOutcome = <E>(exit: Exit.Exit<TicketReceipt, E>): CommandOutcome => {
  if (Exit.isSuccess(exit)) {
    return exit.value.response._tag
  }
  if (Cause.hasInterruptsOnly(exit.cause)) {
    return "interrupt"
  }
  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => "failure",
    onSome: (error) => {
      if (Predicate.isTagged(error, "CommandIdConflict")) {
        return "conflict"
      }
      if (Predicate.isTagged(error, "InvalidCausation")) {
        return "invalid_causation"
      }
      return "failure"
    },
  })
}

const metricAttributes = (
  commandType: string,
  outcome: CommandOutcome,
): ReadonlyArray<[string, string]> => [
  ["commandType", commandType],
  ["outcome", outcome],
]

/** Compte et chronomètre une commande sans y mettre d'identifiants. */
export const observeCommand = <E, R>(
  commandType: string,
  effect: Effect.Effect<TicketReceipt, E, R>,
): Effect.Effect<TicketReceipt, E, R> =>
  Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeNanos
    const exit = yield* Effect.exit(effect)
    const endedAt = yield* Clock.currentTimeNanos
    const outcome = commandOutcome(exit)
    const attributes = metricAttributes(commandType, outcome)
    yield* Metric.update(
      Metric.withAttributes(commandDuration, attributes),
      Duration.nanos(endedAt > startedAt ? endedAt - startedAt : 0n),
    )
    yield* Metric.update(Metric.withAttributes(commandsTotal, attributes), 1)
    return yield* exit
  })
