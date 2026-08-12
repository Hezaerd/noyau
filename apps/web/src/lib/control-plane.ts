import type { TaskCommandRequest } from "@noyau/protocol/commands"
import { ControlPlaneApi, NoyauIdentity } from "@noyau/protocol/control-plane"
import type { TaskId } from "@noyau/protocol/ids"
import { Cause, Context, Crypto, Effect, Exit, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient, HttpClientRequest } from "effect/unstable/http"
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi"

import { sandboxConfig, type SandboxConfig } from "./sandbox-config"
import { buildTaskAssignRequest, buildTaskCreateRequest, type TaskDraft } from "./task-commands"

export type ControlPlaneResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly details: string }

class ControlPlaneClient extends Context.Service<
  ControlPlaneClient,
  HttpApiClient.ForApi<typeof ControlPlaneApi>
>()("@noyau/web/ControlPlaneClient") {
  static layer(config: SandboxConfig) {
    const identityLayer = HttpApiMiddleware.layerClient(NoyauIdentity, ({ next, request }) =>
      next(HttpClientRequest.setHeader(request, "x-noyau-actor-id", config.actorId)),
    )
    const options = config.apiBaseUrl === "" ? {} : { baseUrl: config.apiBaseUrl }

    return Layer.effect(ControlPlaneClient, HttpApiClient.make(ControlPlaneApi, options)).pipe(
      Layer.provide(identityLayer),
      Layer.provide(FetchHttpClient.layer),
    )
  }
}

const browserCrypto = Crypto.make({
  randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) => {
    const input = new Uint8Array(data)
    return Effect.promise(() =>
      globalThis.crypto.subtle.digest(algorithm, input).then((digest) => new Uint8Array(digest)),
    )
  },
})

const runtime = ManagedRuntime.make(
  Layer.merge(ControlPlaneClient.layer(sandboxConfig), Layer.succeed(Crypto.Crypto)(browserCrypto)),
)

const runOperation = async <A, E>(
  operation: Effect.Effect<A, E, ControlPlaneClient | Crypto.Crypto>,
): Promise<ControlPlaneResult<A>> => {
  const exit = await runtime.runPromiseExit(operation)

  return Exit.match(exit, {
    onFailure: (cause) => ({ ok: false, details: Cause.pretty(cause) }),
    onSuccess: (value) => ({ ok: true, value }),
  })
}

const getProjectTaskSnapshot = Effect.fn("ControlPlaneClient.getProjectTaskSnapshot")(function* () {
  const client = yield* ControlPlaneClient

  return yield* client.projects.getProjectTasks({
    params: { projectId: sandboxConfig.projectId },
  })
})

const submitTaskCommand = Effect.fn("ControlPlaneClient.submitTaskCommand")(function* (
  request: TaskCommandRequest,
) {
  const client = yield* ControlPlaneClient

  switch (request._tag) {
    case "task.create":
      return yield* client.projects.submitTaskCommand({
        params: { projectId: sandboxConfig.projectId },
        payload: request,
      })
    case "task.assign":
      return yield* client.projects.submitTaskCommand({
        params: { projectId: sandboxConfig.projectId },
        payload: request,
      })
  }
})

const createTaskCommand = Effect.fn("ControlPlaneClient.createTaskCommand")(function* (
  draft: TaskDraft,
) {
  const crypto = yield* Crypto.Crypto
  const commandId = yield* crypto.randomUUIDv4
  const taskId = yield* crypto.randomUUIDv4
  const request = buildTaskCreateRequest(draft, sandboxConfig.missionId, { commandId, taskId })

  return yield* submitTaskCommand(request)
})

const selfAssignTaskCommand = Effect.fn("ControlPlaneClient.selfAssignTaskCommand")(function* (
  taskId: TaskId,
) {
  const crypto = yield* Crypto.Crypto
  const commandId = yield* crypto.randomUUIDv4
  const request = buildTaskAssignRequest(taskId, sandboxConfig.actorId, commandId)

  return yield* submitTaskCommand(request)
})

export const loadTaskSnapshot = () => runOperation(getProjectTaskSnapshot())

export const createTask = (draft: TaskDraft) => runOperation(createTaskCommand(draft))

export const selfAssignTask = (taskId: TaskId) => runOperation(selfAssignTaskCommand(taskId))
