import { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { ProviderSessionId, ThreadId, TurnId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const ResumeCursorSchemaVersion = Schema.Literal(1)
export type ResumeCursorSchemaVersion = (typeof ResumeCursorSchemaVersion)["Type"]

/** Curseur opaque pour `session/load`. Pas de `cwdLastBound`. */
export const ResumeCursor = Schema.Struct({
  schemaVersion: ResumeCursorSchemaVersion,
  sessionId: ProviderSessionId,
})
export type ResumeCursor = (typeof ResumeCursor)["Type"]

export const SessionStatus = Schema.Literals([
  "idle",
  "starting",
  "running",
  "ready",
  "interrupted",
  "stopped",
  "error",
])
export type SessionStatus = (typeof SessionStatus)["Type"]

/** Projection 0..1 du runtime provider sur un Thread. Pas d'id métier distinct. */
export const Session = Schema.Struct({
  threadId: ThreadId,
  status: SessionStatus,
  lastError: Schema.NullOr(Schema.NonEmptyString),
  activeTurnId: Schema.NullOr(TurnId),
  runtimeMode: RuntimeMode,
  resumeCursor: Schema.NullOr(ResumeCursor),
  updatedAt: Schema.DateTimeUtcFromString,
})
export type Session = (typeof Session)["Type"]
