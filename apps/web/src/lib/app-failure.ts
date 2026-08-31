import { AgentIntegrationFailed } from "@noyau/contracts/agent-integration"
import { OpenInEditorFailed } from "@noyau/contracts/editor"
import {
  CommandIdConflict,
  Forbidden,
  MissingIdentity,
  ServiceUnavailable,
} from "@noyau/contracts/errors"
import { FilePreviewFailed } from "@noyau/contracts/file-preview"
import { GitCommandError } from "@noyau/contracts/git"
import { PreviewTabNotFound, PreviewUrlInvalid } from "@noyau/contracts/preview"
import { ProjectNotFound } from "@noyau/contracts/project/errors"
import { Rejection, type Rejection as RejectionType } from "@noyau/contracts/receipts"
import { TurnDiffUnavailable } from "@noyau/contracts/turn-diff"
import { Cause, Option, Schema } from "effect"
import { RpcClientError } from "effect/unstable/rpc/RpcClientError"

export class ResourceSnapshotUnavailable extends Schema.TaggedError<ResourceSnapshotUnavailable>()(
  "ResourceSnapshotUnavailable",
  { resource: Schema.Literals(["project", "thread"]) },
) {}

const KnownControlPlaneError = Schema.Union([
  Rejection,
  CommandIdConflict,
  ServiceUnavailable,
  MissingIdentity,
  Forbidden,
  FilePreviewFailed,
  PreviewTabNotFound,
  PreviewUrlInvalid,
  TurnDiffUnavailable,
  ProjectNotFound,
  GitCommandError,
  OpenInEditorFailed,
  AgentIntegrationFailed,
  RpcClientError,
  ResourceSnapshotUnavailable,
])
type KnownControlPlaneError = (typeof KnownControlPlaneError)["Type"]

export type FailurePhase = "command" | "input" | "snapshot" | "stream"

export type AppFailure =
  | { readonly _tag: "Rejected"; readonly rejection: RejectionType }
  | { readonly _tag: "CommandConflict"; readonly error: CommandIdConflict }
  | { readonly _tag: "Unavailable"; readonly service: string }
  | { readonly _tag: "Unauthorized" }
  | { readonly _tag: "InvalidInput"; readonly message?: string }
  | {
      readonly _tag: "AgentIntegrationFailure"
      readonly reason: AgentIntegrationFailed["reason"]
    }
  | {
      readonly _tag: "TransportFailure"
      readonly phase: FailurePhase
      readonly reason: "ended" | "failed"
    }
  | { readonly _tag: "Interrupted" }
  | { readonly _tag: "UnexpectedFailure"; readonly incidentId: string }

let incidentSequence = 0

const nextIncidentId = (): string => {
  incidentSequence += 1
  return `web-${incidentSequence.toString(36)}`
}

const unexpectedFailure = (): AppFailure => ({
  _tag: "UnexpectedFailure",
  incidentId: nextIncidentId(),
})

const turnDiffUnavailableMessage = (error: TurnDiffUnavailable): string => {
  switch (error.reason) {
    case "turn-not-found":
      return "This Turn no longer exists."
    case "not-captured":
      return "No Checkpoint was captured for this Turn."
    case "checkpoint-missing":
      return "This Turn's git snapshots are no longer available."
  }
}

const fromTypedError = (error: KnownControlPlaneError, phase: FailurePhase): AppFailure => {
  if (Schema.is(Rejection)(error)) {
    return { _tag: "Rejected", rejection: error }
  }
  if (Schema.is(CommandIdConflict)(error)) {
    return { _tag: "CommandConflict", error }
  }
  if (Schema.is(ServiceUnavailable)(error)) {
    return { _tag: "Unavailable", service: error.service }
  }
  if (Schema.is(GitCommandError)(error) || Schema.is(OpenInEditorFailed)(error)) {
    return { _tag: "InvalidInput", message: error.detail }
  }
  if (Schema.is(MissingIdentity)(error) || Schema.is(Forbidden)(error)) {
    return { _tag: "Unauthorized" }
  }
  if (Schema.is(RpcClientError)(error)) {
    return error.reason._tag === "RpcClientDefect"
      ? unexpectedFailure()
      : { _tag: "TransportFailure", phase, reason: "failed" }
  }
  if (Schema.is(ResourceSnapshotUnavailable)(error)) {
    return { _tag: "TransportFailure", phase: "snapshot", reason: "ended" }
  }
  if (Schema.is(AgentIntegrationFailed)(error)) {
    return { _tag: "AgentIntegrationFailure", reason: error.reason }
  }
  if (Schema.is(TurnDiffUnavailable)(error)) {
    return { _tag: "InvalidInput", message: turnDiffUnavailableMessage(error) }
  }
  if (Schema.is(FilePreviewFailed)(error) || Schema.is(ProjectNotFound)(error)) {
    return { _tag: "InvalidInput" }
  }
  if (Schema.is(PreviewUrlInvalid)(error)) {
    return { _tag: "InvalidInput", message: "Enter a valid URL." }
  }
  if (Schema.is(PreviewTabNotFound)(error)) {
    return { _tag: "InvalidInput", message: "This browser tab is no longer open." }
  }
  if (phase === "input") {
    return { _tag: "InvalidInput" }
  }
  return unexpectedFailure()
}

export const normalizeCause = <E>(cause: Cause.Cause<E>, phase: FailurePhase): AppFailure => {
  if (Cause.hasInterruptsOnly(cause)) {
    return { _tag: "Interrupted" }
  }
  return Option.match(Cause.findErrorOption(cause), {
    onNone: unexpectedFailure,
    onSome: (error) =>
      Option.match(Schema.decodeUnknownOption(KnownControlPlaneError)(error), {
        onNone: () => (phase === "input" ? { _tag: "InvalidInput" } : unexpectedFailure()),
        onSome: (known) => fromTypedError(known, phase),
      }),
  })
}

export const subscriptionEnded = (): AppFailure => ({
  _tag: "TransportFailure",
  phase: "stream",
  reason: "ended",
})

/** Only these failures mean the shared socket is dead and must be replaced. */
export const isTransportReplacementFailure = (failure: AppFailure): boolean =>
  failure._tag === "TransportFailure" || failure._tag === "UnexpectedFailure"

export const invalidInputFailure = (message?: string): AppFailure =>
  message === undefined ? { _tag: "InvalidInput" } : { _tag: "InvalidInput", message }

export const technicalFailureDetails = <E>(cause: Cause.Cause<E>): string => Cause.pretty(cause)
