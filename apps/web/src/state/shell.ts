import type { ProviderInstanceViewMap } from "@noyau/contracts/entities/environment"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import type {
  ProjectShell,
  ShellLiveEvent,
  ShellSnapshot,
  ThreadShell,
} from "@noyau/contracts/shell"
import { Atom } from "effect/unstable/reactivity"

import type { NewThreadDraftId } from "@/lib/composer-drafts"
import type { SubscriptionStatus } from "@/lib/control-plane"
import { applyShellEvent } from "@/lib/control-plane-state"
import {
  lastScreensEqual,
  readLastScreen,
  reconcileLastScreen,
  writeLastScreen,
  type LastScreen,
} from "@/lib/last-screen"
import {
  EMPTY_THREAD_IDS,
  EMPTY_THREAD_SHELL_INDEX,
  EMPTY_THREAD_SHELLS,
  indexThreadShells,
  type ThreadShellIndex,
} from "@/lib/thread-shell-index"
import { appAtomRegistry } from "@/state/atom-registry"
import { promoteComposerDraft } from "@/state/composer-drafts"
import { applyKeybindingsLiveEvent } from "@/state/keybindings"

export const EMPTY_PROJECTS: ReadonlyArray<ProjectShell> = Object.freeze([])

export const emptyThreadShellAtom = Atom.make<ThreadShell | undefined>(undefined).pipe(
  Atom.withLabel("shell:thread:empty"),
)

export const emptyThreadIdsAtom = Atom.make(EMPTY_THREAD_IDS).pipe(
  Atom.withLabel("shell:project-thread-ids:empty"),
)

export const emptyThreadShellsAtom = Atom.make(EMPTY_THREAD_SHELLS).pipe(
  Atom.withLabel("shell:project-threads:empty"),
)

export const appliedShellAtom = Atom.make<ShellSnapshot | undefined>(undefined).pipe(
  Atom.keepAlive,
  Atom.withLabel("shell:applied"),
)

export const subscriptionStatusAtom = Atom.make<SubscriptionStatus | undefined>(undefined).pipe(
  Atom.keepAlive,
  Atom.withLabel("shell:subscription-status"),
)

export const lastScreenAtom = Atom.make<LastScreen | undefined>(undefined).pipe(
  Atom.keepAlive,
  Atom.withLabel("shell:last-screen"),
)

export const lastProjectIdAtom = Atom.make(
  (get): ProjectId | undefined => get(lastScreenAtom)?.projectId,
).pipe(Atom.keepAlive, Atom.withLabel("shell:last-project"))

let previousThreadIndex = EMPTY_THREAD_SHELL_INDEX

export const threadIndexAtom = Atom.make((get): ThreadShellIndex => {
  const threads = get(appliedShellAtom)?.threads ?? EMPTY_THREAD_SHELLS
  previousThreadIndex = indexThreadShells(threads, previousThreadIndex)
  return previousThreadIndex
}).pipe(Atom.withLabel("shell:thread-index"))

export const projectsAtom = Atom.make(
  (get): ReadonlyArray<ProjectShell> => get(appliedShellAtom)?.projects ?? EMPTY_PROJECTS,
).pipe(Atom.withLabel("shell:projects"))

export const selectedProjectAtom = Atom.make((get): ProjectShell | undefined => {
  const projects = get(projectsAtom)
  const lastProjectId = get(lastProjectIdAtom)
  return projects.find((project) => project.id === lastProjectId) ?? projects[0]
}).pipe(Atom.withLabel("shell:selected-project"))

export const providersAtom = Atom.make((get): ProviderInstanceViewMap => {
  return get(appliedShellAtom)?.environment.providers ?? {}
}).pipe(Atom.withLabel("shell:providers"))

export const threadsAtom = Atom.make(
  (get): ReadonlyArray<ThreadShell> => get(appliedShellAtom)?.threads ?? EMPTY_THREAD_SHELLS,
).pipe(Atom.withLabel("shell:threads"))

export const threadShellAtom = Atom.family((threadId: ThreadId) =>
  Atom.make((get): ThreadShell | undefined => get(threadIndexAtom).threadsById.get(threadId)).pipe(
    Atom.withLabel(`shell:thread:${threadId}`),
  ),
)

export const projectThreadIdsAtom = Atom.family((projectId: ProjectId) =>
  Atom.make(
    (get): ReadonlyArray<ThreadId> =>
      get(threadIndexAtom).threadIdsByProjectId.get(projectId) ?? EMPTY_THREAD_IDS,
  ).pipe(Atom.withLabel(`shell:project-thread-ids:${projectId}`)),
)

export const projectThreadsAtom = Atom.family((projectId: ProjectId) =>
  Atom.make(
    (get): ReadonlyArray<ThreadShell> =>
      get(threadIndexAtom).threadsByProjectId.get(projectId) ?? EMPTY_THREAD_SHELLS,
  ).pipe(Atom.withLabel(`shell:project-threads:${projectId}`)),
)

const persistLastScreen = (next: LastScreen | undefined): void => {
  const current = appAtomRegistry.get(lastScreenAtom)
  if (lastScreensEqual(current, next)) {
    return
  }
  appAtomRegistry.set(lastScreenAtom, next)
  writeLastScreen(next)
}

const reconcileRememberedLastScreen = (
  projects: ReadonlyArray<ProjectShell>,
  threads: ReadonlyArray<ThreadShell>,
): void => {
  persistLastScreen(reconcileLastScreen(appAtomRegistry.get(lastScreenAtom), projects, threads))
}

let lastScreenHydrated = false

export const hydrateLastScreen = (): void => {
  if (lastScreenHydrated) {
    return
  }
  lastScreenHydrated = true
  appAtomRegistry.set(lastScreenAtom, readLastScreen())
}

export const rememberLastScreen = (screen: LastScreen): void => {
  persistLastScreen(screen)
}

export const selectProject = (projectId: ProjectId): void => {
  const current = appAtomRegistry.get(lastScreenAtom)
  if (current?.projectId === projectId) {
    return
  }
  persistLastScreen({ _tag: "board", projectId })
}

export const getAppliedShell = (): ShellSnapshot | undefined =>
  appAtomRegistry.get(appliedShellAtom)

export const replaceAppliedShell = (next: ShellSnapshot): void => {
  if (Object.is(appAtomRegistry.get(appliedShellAtom), next)) {
    return
  }
  appAtomRegistry.set(appliedShellAtom, next)
  reconcileRememberedLastScreen(next.projects, next.threads)
}

export const reduceAppliedShellEvent = (event: ShellLiveEvent): boolean => {
  const current = appAtomRegistry.get(appliedShellAtom)
  if (current === undefined) {
    return false
  }
  applyKeybindingsLiveEvent(event)
  const next = applyShellEvent(current, event)
  if (!Object.is(next, current)) {
    appAtomRegistry.set(appliedShellAtom, next)
    reconcileRememberedLastScreen(next.projects, next.threads)
  }
  return true
}

export const patchAppliedShellThread = (
  threadId: ThreadId,
  patch: (thread: ThreadShell) => ThreadShell,
): boolean => {
  const current = appAtomRegistry.get(appliedShellAtom)
  if (current === undefined) {
    return false
  }
  let changed = false
  const threads = current.threads.map((thread) => {
    if (thread.id !== threadId) {
      return thread
    }
    const next = patch(thread)
    if (!Object.is(next, thread)) {
      changed = true
    }
    return next
  })
  if (!changed) {
    return false
  }
  appAtomRegistry.set(appliedShellAtom, { ...current, threads })
  return true
}

export const upsertAppliedShellThread = (thread: ThreadShell): boolean => {
  const current = appAtomRegistry.get(appliedShellAtom)
  if (current === undefined) {
    return false
  }
  if (current.threads.some((candidate) => candidate.id === thread.id)) {
    return true
  }
  appAtomRegistry.set(appliedShellAtom, { ...current, threads: [...current.threads, thread] })
  return true
}

/** Optimistic sidebar row + promote the new-Thread Brouillon in one notification. */
export const publishCreatedThread = (thread: ThreadShell, draftId?: NewThreadDraftId): boolean => {
  let inserted = false
  Atom.batch(() => {
    inserted = upsertAppliedShellThread(thread)
    promoteComposerDraft(thread.projectId, thread.id, draftId)
  })
  return inserted
}

export const setSubscriptionStatus = (status: SubscriptionStatus): void => {
  appAtomRegistry.set(subscriptionStatusAtom, status)
}

export const resetAppliedShell = (): void => {
  previousThreadIndex = EMPTY_THREAD_SHELL_INDEX
  lastScreenHydrated = false
  appAtomRegistry.set(appliedShellAtom, undefined)
  appAtomRegistry.set(subscriptionStatusAtom, undefined)
  appAtomRegistry.set(lastScreenAtom, undefined)
}
