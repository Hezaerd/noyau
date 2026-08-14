import { Context, Schema } from "effect"

import { type ActorId, CommandId, EventId } from "./ids"

export class InvalidCausation extends Schema.TaggedError<InvalidCausation>()("InvalidCausation", {
  causationId: EventId,
}) {}

export class InvalidEventCursor extends Schema.TaggedError<InvalidEventCursor>()(
  "InvalidEventCursor",
  {
    cursor: Schema.String,
  },
) {}

export class MissingIdentity extends Schema.TaggedError<MissingIdentity>()("MissingIdentity", {}) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {}) {}

export class CommandIdConflict extends Schema.TaggedError<CommandIdConflict>()(
  "CommandIdConflict",
  {
    commandId: CommandId,
  },
) {}

export class ServiceUnavailable extends Schema.TaggedError<ServiceUnavailable>()(
  "ServiceUnavailable",
  {
    service: Schema.NonEmptyString,
  },
) {}

/** Identité vérifiée fournie aux handlers protégés. */
export class CurrentActor extends Context.Service<CurrentActor, ActorId>()(
  "@noyau/protocol/CurrentActor",
) {}
