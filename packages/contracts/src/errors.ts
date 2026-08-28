import { Context, Schema } from "effect"

import type { ActorId } from "./ids.ts"
import { CommandId } from "./ids.ts"

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

/** Identité vérifiée fournie aux handlers protégés. L'acteur n'est jamais dans le payload. */
export class CurrentActor extends Context.Service<CurrentActor, ActorId>()(
  "@noyau/contracts/CurrentActor",
) {}
