import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"

import { Deferred, Effect, Schema, Stream } from "effect"

export class AcpTransportError extends Schema.TaggedError<AcpTransportError>()(
  "AcpTransportError",
  {
    detail: Schema.NonEmptyString,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export class AcpRequestError extends Schema.TaggedError<AcpRequestError>()("AcpRequestError", {
  method: Schema.NonEmptyString,
  code: Schema.Int,
  detail: Schema.NonEmptyString,
  data: Schema.optionalKey(Schema.Json),
}) {}

export type AcpConnectionError = AcpRequestError | AcpTransportError

const JsonRpcId = Schema.Union([Schema.String, Schema.Number, Schema.Null])
const JsonRpcError = Schema.Struct({
  code: Schema.Int,
  message: Schema.NonEmptyString,
  data: Schema.optionalKey(Schema.Json),
})
const JsonRpcEnvelope = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.optionalKey(JsonRpcId),
  method: Schema.optionalKey(Schema.NonEmptyString),
  params: Schema.optionalKey(Schema.Json),
  result: Schema.optionalKey(Schema.Json),
  error: Schema.optionalKey(JsonRpcError),
})
type JsonRpcEnvelope = (typeof JsonRpcEnvelope)["Type"]

const decodeEnvelope = Schema.decodeUnknownEffect(Schema.fromJsonString(JsonRpcEnvelope))

export interface AcpConnectionHandlers {
  readonly notification: (
    method: string,
    params: Schema.Json | undefined,
  ) => Effect.Effect<void, AcpConnectionError>
  readonly request: (
    id: string | number | null,
    method: string,
    params: Schema.Json | undefined,
  ) => Effect.Effect<Schema.Json, AcpConnectionError>
}

export interface AcpConnection {
  readonly request: (
    method: string,
    params: Schema.Json,
  ) => Effect.Effect<Schema.Json | undefined, AcpConnectionError>
  readonly notify: (method: string, params: Schema.Json) => Effect.Effect<void, AcpTransportError>
  readonly stderr: Effect.Effect<string>
}

const transportError = (detail: string, cause?: unknown) =>
  cause === undefined ? new AcpTransportError({ detail }) : new AcpTransportError({ detail, cause })

const requestKey = (id: string | number | null) => String(id)

export const makeAcpConnection = Effect.fn("AcpJsonRpc.makeConnection")(function* (
  child: ChildProcessWithoutNullStreams,
  handlers: AcpConnectionHandlers,
) {
  let nextId = 1
  let closed = false
  const pending = new Map<
    string,
    {
      readonly method: string
      readonly deferred: Deferred.Deferred<Schema.Json | undefined, AcpConnectionError>
    }
  >()
  const stderrLines: Array<string> = []
  const stdout = createInterface({ input: child.stdout, crlfDelay: Infinity })
  const stderr = createInterface({ input: child.stderr, crlfDelay: Infinity })

  const write = (envelope: JsonRpcEnvelope) =>
    Effect.callback<void, AcpTransportError>((resume) => {
      if (closed || child.stdin.destroyed || !child.stdin.writable) {
        resume(Effect.fail(transportError("Cursor ACP stdin is closed")))
        return
      }
      child.stdin.write(`${JSON.stringify(envelope)}\n`, "utf8", (cause) => {
        resume(
          cause === null || cause === undefined
            ? Effect.void
            : Effect.fail(transportError("Failed to write Cursor ACP stdin", cause)),
        )
      })
    })

  const failPending = (error: AcpTransportError) =>
    Effect.gen(function* () {
      if (closed) {
        return
      }
      closed = true
      for (const entry of pending.values()) {
        yield* Deferred.fail(entry.deferred, error)
      }
      pending.clear()
    })

  const reply = (
    id: string | number | null,
    result: Schema.Json,
  ): Effect.Effect<void, AcpTransportError> => write({ jsonrpc: "2.0", id, result })

  const replyError = (
    id: string | number | null,
    error: { readonly code: number; readonly message: string; readonly data?: Schema.Json },
  ): Effect.Effect<void, AcpTransportError> =>
    write({
      jsonrpc: "2.0",
      id,
      error:
        error.data === undefined
          ? { code: error.code, message: error.message }
          : { code: error.code, message: error.message, data: error.data },
    })

  const replyRequestError = (id: string | number | null, error: AcpRequestError) =>
    error.data === undefined
      ? replyError(id, { code: error.code, message: error.detail })
      : replyError(id, {
          code: error.code,
          message: error.detail,
          data: error.data,
        })

  const handleEnvelope = Effect.fn("AcpJsonRpc.handleEnvelope")(function* (
    envelope: JsonRpcEnvelope,
  ) {
    if (envelope.method !== undefined) {
      if (envelope.id === undefined) {
        yield* handlers.notification(envelope.method, envelope.params)
        return
      }
      yield* handlers.request(envelope.id, envelope.method, envelope.params).pipe(
        Effect.flatMap((result) => reply(envelope.id!, result)),
        Effect.catchTags({
            AcpRequestError: (error) => replyRequestError(envelope.id!, error),
          AcpTransportError: (error) =>
            replyError(envelope.id!, {
              code: -32_603,
              message: error.detail,
            }),
        }),
        Effect.catch(() => Effect.void),
        Effect.forkScoped,
      )
      return
    }

    if (envelope.id === undefined) {
      return
    }
    const key = requestKey(envelope.id)
    const entry = pending.get(key)
    if (entry === undefined) {
      return
    }
    pending.delete(key)
    if (envelope.error !== undefined) {
      const requestError =
        envelope.error.data === undefined
          ? new AcpRequestError({
              method: entry.method,
              code: envelope.error.code,
              detail: envelope.error.message,
            })
          : new AcpRequestError({
              method: entry.method,
              code: envelope.error.code,
              detail: envelope.error.message,
              data: envelope.error.data,
            })
      yield* Deferred.fail(
        entry.deferred,
        requestError,
      )
      return
    }
    yield* Deferred.succeed(entry.deferred, envelope.result)
  })

  const readStdout = Stream.fromAsyncIterable(stdout, (cause) =>
    transportError("Failed to read Cursor ACP stdout", cause),
  ).pipe(
    Stream.mapEffect((line) =>
      decodeEnvelope(line).pipe(
        Effect.mapError((cause) => transportError("Cursor ACP emitted invalid JSON-RPC", cause)),
      ),
    ),
    Stream.runForEach(handleEnvelope),
    Effect.flatMap(() => {
      const exit = child.exitCode === null ? child.signalCode : child.exitCode
      const suffix = stderrLines.length === 0 ? "" : `: ${stderrLines.join("\n")}`
      return failPending(transportError(`Cursor ACP stdout closed (${String(exit)})${suffix}`))
    }),
    Effect.catch((error) => failPending(error)),
  )
  yield* Effect.forkScoped(readStdout, { startImmediately: true })

  yield* Stream.fromAsyncIterable(stderr, (cause) =>
    transportError("Failed to read Cursor ACP stderr", cause),
  ).pipe(
    Stream.runForEach((line) =>
      Effect.sync(() => {
        stderrLines.push(line)
        if (stderrLines.length > 20) {
          stderrLines.shift()
        }
      }),
    ),
    Effect.catch(() => Effect.void),
    Effect.forkScoped,
  )

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      closed = true
      stdout.close()
      stderr.close()
    }),
  )

  const request = Effect.fn("AcpJsonRpc.request")(function* (
    method: string,
    params: Schema.Json,
  ) {
    if (closed) {
      return yield* transportError("Cursor ACP connection is closed")
    }
    const id = nextId
    nextId += 1
    const deferred = yield* Deferred.make<Schema.Json | undefined, AcpConnectionError>()
    pending.set(requestKey(id), { method, deferred })
    yield* write({ jsonrpc: "2.0", id, method, params }).pipe(
      Effect.onError(() =>
        Effect.sync(() => {
          pending.delete(requestKey(id))
        }),
      ),
    )
    return yield* Deferred.await(deferred)
  })

  const notify = (method: string, params: Schema.Json) =>
    write({ jsonrpc: "2.0", method, params })

  return {
    request,
    notify,
    stderr: Effect.sync(() => stderrLines.join("\n")),
  } satisfies AcpConnection
})
