import type { Provider } from "@noyau/contracts/entities/environment"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { Effect } from "effect"

import { publishCreatedThread } from "@/state/shell"

import type { AppFailure } from "./app-failure"
import { buildCommand, dispatchCommand } from "./control-plane"
import { makeOptimisticThreadShell } from "./control-plane-state"
import { DEFAULT_THREAD_TITLE, makeThreadCreateRequest, makeThreadId } from "./thread-commands"

export type CreateDraftThreadResult =
  | { readonly ok: true; readonly threadId: ThreadId }
  | { readonly ok: false; readonly failure: AppFailure }

export type CreateDraftThreadInput = {
  readonly projectId: ProjectId
  readonly provider?: Provider
  readonly modelSelection?: ModelSelection | null
  readonly runtimeMode?: RuntimeMode
}

const inflightNewRouteCreates = new Map<string, Promise<CreateDraftThreadResult>>()

export const createDraftThreadEffect = Effect.fn("createDraftThread")(function* (
  input: CreateDraftThreadInput,
) {
  const runtimeMode = input.runtimeMode ?? "full-access"
  const nextThreadId = yield* Effect.promise(() => buildCommand(makeThreadId()))
  if (!nextThreadId.ok) {
    return { ok: false as const, failure: nextThreadId.failure }
  }
  const createRequest = yield* Effect.promise(() =>
    buildCommand(
      makeThreadCreateRequest(
        Object.assign(
          {
            threadId: nextThreadId.value,
            projectId: input.projectId,
            title: DEFAULT_THREAD_TITLE,
            runtimeMode,
          },
          input.provider === undefined ? {} : { provider: input.provider },
          input.modelSelection === undefined || input.modelSelection === null
            ? {}
            : { modelSelection: input.modelSelection },
        ),
      ),
    ),
  )
  if (!createRequest.ok) {
    return { ok: false as const, failure: createRequest.failure }
  }
  const created = yield* Effect.promise(() => dispatchCommand(createRequest.value))
  if (!created.ok) {
    return { ok: false as const, failure: created.failure }
  }
  publishCreatedThread(
    makeOptimisticThreadShell(
      Object.assign(
        {
          id: nextThreadId.value,
          projectId: input.projectId,
          title: DEFAULT_THREAD_TITLE,
          runtimeMode,
        },
        input.provider === undefined ? {} : { provider: input.provider },
      ),
    ),
  )
  return { ok: true as const, threadId: nextThreadId.value }
})

export const createDraftThread = (
  input: CreateDraftThreadInput,
): Promise<CreateDraftThreadResult> => Effect.runPromise(createDraftThreadEffect(input))

/** Dedupes the `/thread/new` landing so Strict Mode does not persist two drafts. */
export const createDraftThreadForNewRoute = (
  input: CreateDraftThreadInput,
  create: (next: CreateDraftThreadInput) => Promise<CreateDraftThreadResult> = createDraftThread,
): Promise<CreateDraftThreadResult> => {
  const existing = inflightNewRouteCreates.get(input.projectId)
  if (existing !== undefined) {
    return existing
  }
  const pending = create(input).finally(() => {
    if (inflightNewRouteCreates.get(input.projectId) === pending) {
      inflightNewRouteCreates.delete(input.projectId)
    }
  })
  inflightNewRouteCreates.set(input.projectId, pending)
  return pending
}

export const resetDraftThreadNewRouteCreates = (): void => {
  inflightNewRouteCreates.clear()
}
