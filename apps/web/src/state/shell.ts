import {
  BusinessRpcError,
  ConnectionSupervisor,
  TransportRupture,
  type ClassifyableControlPlaneError,
  type ConnectionState,
} from "@noyau/client-runtime/connection"
import {
  classifyShellResourceError,
  createShellResourceAtom,
  EMPTY_PROJECTS,
  EMPTY_THREAD_IDS,
  EMPTY_THREAD_SHELL_INDEX,
  EMPTY_THREAD_SHELLS,
  indexThreadShells,
  mergeOptimisticThreads,
  remainingOptimisticThreads,
  selectProjectThreadIds,
  selectProjectThreads,
  selectShellCursor,
  selectShellProjects,
  selectShellThreads,
  selectThreadShellById,
  type ShellResourceState,
  type ThreadShellIndex,
} from "@noyau/client-runtime/state/shell"
import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import type {
  ProjectShell,
  ShellLiveEvent,
  ShellSnapshot,
  ThreadShell,
} from "@noyau/protocol/shell"
import { Cause, Effect, Option, Schema, Stream, SubscriptionRef } from "effect"
import { AsyncResult, Atom } from "effect/unstable/reactivity"

import { clientAtomRuntime } from "@/client-runtime/runtime"
import { normalizeCause, type AppFailure } from "@/lib/app-failure"
import type { SubscriptionStatus } from "@/lib/control-plane"
import { applyShellEvent, readLastProjectId, writeLastProjectId } from "@/lib/control-plane-state"
import { nextLastProjectId } from "@/lib/project-navigation"
import { appAtomRegistry } from "@/state/atom-registry"
import { promoteComposerDraft } from "@/state/composer-drafts"

export { EMPTY_PROJECTS }

export const emptyThreadShellAtom = Atom.make<ThreadShell | undefined>(undefined).pipe(
  Atom.withLabel("shell:thread:empty"),
)

export const emptyThreadIdsAtom = Atom.make(EMPTY_THREAD_IDS).pipe(
  Atom.withLabel("shell:project-thread-ids:empty"),
)

export const emptyThreadShellsAtom = Atom.make(EMPTY_THREAD_SHELLS).pipe(
  Atom.withLabel("shell:project-threads:empty"),
)

const testShellSeedAtom = Atom.make<ShellSnapshot | undefined>(undefined).pipe(
  Atom.keepAlive,
  Atom.withLabel("shell:test-seed"),
)

const optimisticThreadsAtom = Atom.make<ReadonlyArray<ThreadShell>>([]).pipe(
  Atom.keepAlive,
  Atom.withLabel("shell:optimistic-threads"),
)

const testSubscriptionStatusAtom = Atom.make<SubscriptionStatus | undefined>(undefined).pipe(
  Atom.keepAlive,
  Atom.withLabel("shell:test-subscription-status"),
)

const shellLiveEnabledAtom = Atom.make(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("shell:live-enabled"),
)

export const lastProjectIdAtom = Atom.make<ProjectId | undefined>(undefined).pipe(
  Atom.keepAlive,
  Atom.withLabel("shell:last-project"),
)

export const shellResourceAtom = createShellResourceAtom(clientAtomRuntime).pipe(
  Atom.withLabel("shell:resource"),
)

export const connectionStateAtom = clientAtomRuntime
  .atom(
    Stream.unwrap(
      ConnectionSupervisor.pipe(
        Effect.map((supervisor) => SubscriptionRef.changes(supervisor.state)),
      ),
    ),
  )
  .pipe(Atom.withLabel("shell:connection-state"))

const asyncValue = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | undefined =>
  Option.getOrUndefined(AsyncResult.value(result))

const failureFromControlPlaneError = (error: ClassifyableControlPlaneError): AppFailure => {
  if (Schema.is(TransportRupture)(error)) {
    return { _tag: "TransportFailure", phase: "stream", reason: error.reason }
  }
  if (Schema.is(BusinessRpcError)(error)) {
    return normalizeCause(Cause.fail(error.cause), "stream")
  }
  return normalizeCause(Cause.fail(error), "stream")
}

/**
 * UI subscription status for the Shell path. Projection `live` may show
 * Connected; `synchronized` is never transport Connected. Supervisor
 * reconnecting or a synchronizing projection that still has a value is
 * Reconnecting. A business error is Failed.
 */
export const shellSubscriptionStatus = (
  resource: ShellResourceState | undefined,
  connection: ConnectionState | undefined,
): SubscriptionStatus | undefined => {
  if (resource?.error !== undefined && classifyShellResourceError(resource.error) === "business") {
    return { _tag: "Failed", failure: failureFromControlPlaneError(resource.error) }
  }

  const transportReconnecting =
    connection?.phase === "reconnecting" ||
    (connection?.phase === "connecting" && connection.attempt > 0)
  const syncingWithValue = resource?.phase === "synchronizing" && resource.value !== undefined

  if (transportReconnecting || syncingWithValue) {
    const failure =
      connection?.failure !== undefined
        ? failureFromControlPlaneError(connection.failure)
        : resource?.error !== undefined
          ? failureFromControlPlaneError(resource.error)
          : {
              _tag: "TransportFailure" as const,
              phase: "stream" as const,
              reason: "failed" as const,
            }
    return {
      _tag: "Reconnecting",
      attempt: Math.max(1, connection?.attempt ?? 1),
      failure,
    }
  }

  if (resource?.phase === "live") {
    return { _tag: "Connected" }
  }

  return undefined
}

export const appliedShellAtom = Atom.make((get): ShellSnapshot | undefined => {
  const seeded = get(testShellSeedAtom)
  const overlay = get(optimisticThreadsAtom)
  const base =
    seeded ?? (get(shellLiveEnabledAtom) ? asyncValue(get(shellResourceAtom))?.value : undefined)
  if (base === undefined) {
    return undefined
  }
  return mergeOptimisticThreads(base, overlay)
}).pipe(Atom.withLabel("shell:applied"))

export const subscriptionStatusAtom = Atom.make((get): SubscriptionStatus | undefined => {
  const override = get(testSubscriptionStatusAtom)
  if (override !== undefined) {
    return override
  }
  if (!get(shellLiveEnabledAtom)) {
    return undefined
  }
  return shellSubscriptionStatus(
    asyncValue(get(shellResourceAtom)),
    asyncValue(get(connectionStateAtom)),
  )
}).pipe(Atom.withLabel("shell:subscription-status"))

let previousThreadIndex = EMPTY_THREAD_SHELL_INDEX

export const threadIndexAtom = Atom.make((get): ThreadShellIndex => {
  previousThreadIndex = indexThreadShells(
    selectShellThreads(get(appliedShellAtom)),
    previousThreadIndex,
  )
  return previousThreadIndex
}).pipe(Atom.withLabel("shell:thread-index"))

export const projectsAtom = Atom.make((get): ReadonlyArray<ProjectShell> =>
  selectShellProjects(get(appliedShellAtom)),
).pipe(Atom.withLabel("shell:projects"))

export const selectedProjectAtom = Atom.make((get) => {
  const projects = get(projectsAtom)
  const lastProjectId = get(lastProjectIdAtom)
  return projects.find((project) => project.id === lastProjectId) ?? projects[0]
}).pipe(Atom.withLabel("shell:selected-project"))

export const cursorAtom = Atom.make((get): CursorProviderStatus | undefined =>
  selectShellCursor(get(appliedShellAtom)),
).pipe(Atom.withLabel("shell:cursor"))

export const threadsAtom = Atom.make((get): ReadonlyArray<ThreadShell> =>
  selectShellThreads(get(appliedShellAtom)),
).pipe(Atom.withLabel("shell:threads"))

export const threadShellAtom = Atom.family((threadId: ThreadId) =>
  Atom.make((get): ThreadShell | undefined =>
    selectThreadShellById(get(threadIndexAtom), threadId),
  ).pipe(Atom.withLabel(`shell:thread:${threadId}`)),
)

export const projectThreadIdsAtom = Atom.family((projectId: ProjectId) =>
  Atom.make((get): ReadonlyArray<ThreadId> =>
    selectProjectThreadIds(get(threadIndexAtom), projectId),
  ).pipe(Atom.withLabel(`shell:project-thread-ids:${projectId}`)),
)

export const projectThreadsAtom = Atom.family((projectId: ProjectId) =>
  Atom.make((get): ReadonlyArray<ThreadShell> =>
    selectProjectThreads(get(threadIndexAtom), projectId),
  ).pipe(Atom.withLabel(`shell:project-threads:${projectId}`)),
)

const reconcileLastProjectId = (projects: ReadonlyArray<{ readonly id: ProjectId }>): void => {
  const current = appAtomRegistry.get(lastProjectIdAtom)
  const next = nextLastProjectId(projects, current)
  if (next === current) {
    return
  }
  appAtomRegistry.set(lastProjectIdAtom, next)
  writeLastProjectId(next)
}

let lastProjectHydrated = false

export const hydrateLastProjectId = (): void => {
  if (lastProjectHydrated) {
    return
  }
  lastProjectHydrated = true
  appAtomRegistry.set(lastProjectIdAtom, readLastProjectId())
}

export const selectProject = (projectId: ProjectId): void => {
  appAtomRegistry.set(lastProjectIdAtom, projectId)
  writeLastProjectId(projectId)
}

export const enableLiveShell = (): void => {
  appAtomRegistry.set(shellLiveEnabledAtom, true)
}

export const getAppliedShell = (): ShellSnapshot | undefined =>
  appAtomRegistry.get(appliedShellAtom)

const getBaseShell = (): ShellSnapshot | undefined => {
  const seeded = appAtomRegistry.get(testShellSeedAtom)
  if (seeded !== undefined) {
    return seeded
  }
  if (!appAtomRegistry.get(shellLiveEnabledAtom)) {
    return undefined
  }
  return asyncValue(appAtomRegistry.get(shellResourceAtom))?.value
}

/** Test helper: seed the derived snapshot without writing the live resource. */
export const seedShellForTests = (next: ShellSnapshot): void => {
  if (Object.is(appAtomRegistry.get(testShellSeedAtom), next)) {
    return
  }
  appAtomRegistry.set(testShellSeedAtom, next)
  reconcileLastProjectId(next.projects)
}

/** @deprecated Test helper alias. Production uses the Shell resource atom. */
export const replaceAppliedShell = seedShellForTests

/** Test helper: apply a live event onto the seeded snapshot. */
export const reduceAppliedShellEvent = (event: ShellLiveEvent): boolean => {
  const current = getBaseShell()
  if (current === undefined) {
    return false
  }
  const next = applyShellEvent(current, event)
  if (!Object.is(next, current)) {
    appAtomRegistry.set(testShellSeedAtom, next)
    reconcileLastProjectId(next.projects)
  }
  return true
}

export const upsertAppliedShellThread = (thread: ThreadShell): boolean => {
  const current = getBaseShell()
  if (current === undefined) {
    return false
  }
  if (current.threads.some((candidate) => candidate.id === thread.id)) {
    return true
  }
  const overlay = appAtomRegistry.get(optimisticThreadsAtom)
  if (overlay.some((candidate) => candidate.id === thread.id)) {
    return true
  }
  appAtomRegistry.set(optimisticThreadsAtom, [...overlay, thread])
  return true
}

/** Optimistic sidebar row + promote the new-Thread Brouillon in one notification. */
export const publishCreatedThread = (thread: ThreadShell): boolean => {
  let inserted = false
  Atom.batch(() => {
    inserted = upsertAppliedShellThread(thread)
    promoteComposerDraft(thread.projectId, thread.id)
  })
  return inserted
}

export const setSubscriptionStatus = (status: SubscriptionStatus): void => {
  appAtomRegistry.set(testSubscriptionStatusAtom, status)
}

export const resetAppliedShell = (): void => {
  previousThreadIndex = EMPTY_THREAD_SHELL_INDEX
  lastProjectHydrated = false
  appAtomRegistry.set(testShellSeedAtom, undefined)
  appAtomRegistry.set(optimisticThreadsAtom, [])
  appAtomRegistry.set(testSubscriptionStatusAtom, undefined)
  appAtomRegistry.set(shellLiveEnabledAtom, false)
  appAtomRegistry.set(lastProjectIdAtom, undefined)
}

export const reconcileShellLastProjectId = (snapshot: ShellSnapshot | undefined): void => {
  if (snapshot !== undefined) {
    reconcileLastProjectId(snapshot.projects)
  }
}

/** Drop overlay rows already present on the remote/seeded snapshot. */
export const pruneOptimisticThreads = (): void => {
  const base = getBaseShell()
  if (base === undefined) {
    return
  }
  const overlay = appAtomRegistry.get(optimisticThreadsAtom)
  const remaining = remainingOptimisticThreads(base, overlay)
  if (remaining.length !== overlay.length) {
    appAtomRegistry.set(optimisticThreadsAtom, remaining)
  }
}

export { EMPTY_THREAD_IDS, EMPTY_THREAD_SHELLS }
