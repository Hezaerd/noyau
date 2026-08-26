import { Forbidden, MissingIdentity, ServiceUnavailable } from "@noyau/protocol/errors"
import { GitCommandError } from "@noyau/protocol/git"
import { Schema } from "effect"
import { RpcClientError } from "effect/unstable/rpc/RpcClientError"

export type ConnectionPhase = "connecting" | "connected" | "reconnecting" | "unavailable"

export type ConnectionFailure = TransportRupture | BusinessRpcError

export interface ConnectionState {
  readonly phase: ConnectionPhase
  readonly generation: number
  readonly attempt: number
  readonly failure?: ConnectionFailure
}

export class TransportRupture extends Schema.TaggedError<TransportRupture>()("TransportRupture", {
  reason: Schema.Literals(["ended", "failed"]),
}) {}

export class BusinessRpcError extends Schema.TaggedError<BusinessRpcError>()("BusinessRpcError", {
  cause: Schema.Union([Forbidden, MissingIdentity, ServiceUnavailable]),
}) {}

export type ControlPlaneErrorClass = "transport" | "business" | "unexpected"

export type ClassifyableControlPlaneError =
  | TransportRupture
  | BusinessRpcError
  | RpcClientError
  | Forbidden
  | MissingIdentity
  | ServiceUnavailable
  | GitCommandError
  | Error

const isRpcClientDefect = (error: RpcClientError): boolean =>
  error.reason._tag === "RpcClientDefect"

export const classifyControlPlaneError = (
  error: ClassifyableControlPlaneError,
): ControlPlaneErrorClass => {
  if (Schema.is(TransportRupture)(error)) {
    return "transport"
  }
  if (Schema.is(RpcClientError)(error)) {
    return isRpcClientDefect(error) ? "unexpected" : "transport"
  }
  if (
    Schema.is(Forbidden)(error) ||
    Schema.is(MissingIdentity)(error) ||
    Schema.is(ServiceUnavailable)(error) ||
    Schema.is(GitCommandError)(error) ||
    Schema.is(BusinessRpcError)(error)
  ) {
    return "business"
  }
  return "unexpected"
}

export const asTransportRupture = (error: ClassifyableControlPlaneError): TransportRupture =>
  Schema.is(TransportRupture)(error) ? error : new TransportRupture({ reason: "failed" })

/** Noyau local backoff: 100, 200, 400, … capped at 2000 ms. */
export const reconnectBackoffMs = (attempt: number): number =>
  Math.min(100 * 2 ** Math.max(0, attempt - 1), 2_000)

export const connectionState = (
  phase: ConnectionPhase,
  generation: number,
  attempt: number,
  failure?: ConnectionFailure,
): ConnectionState =>
  failure === undefined ? { phase, generation, attempt } : { phase, generation, attempt, failure }
