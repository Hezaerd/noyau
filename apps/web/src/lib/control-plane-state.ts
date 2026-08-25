import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"
import { ProjectId } from "@noyau/protocol/ids"
import type {
  ProjectShell,
  ShellLiveEvent,
  ShellSnapshot,
  ThreadShell,
} from "@noyau/protocol/shell"
import { createContext } from "react"

import type { SubscriptionStatus } from "./control-plane"

export interface ControlPlaneContextValue {
  readonly shell: ShellSnapshot | undefined
  readonly cursor: CursorProviderStatus | undefined
  readonly projects: ReadonlyArray<ProjectShell>
  readonly threads: ReadonlyArray<ThreadShell>
  readonly lastProjectId: ProjectId | undefined
  readonly subscriptionStatus: SubscriptionStatus | undefined
  readonly selectProject: (projectId: ProjectId) => void
}

export const ControlPlaneContext = createContext<ControlPlaneContextValue | undefined>(undefined)

export const LAST_PROJECT_STORAGE_KEY = "noyau.last-project-id"

export const readLastProjectId = (): ProjectId | undefined => {
  try {
    const value = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)
    return value === null ? undefined : ProjectId.make(value)
  } catch {
    return undefined
  }
}

export const writeLastProjectId = (projectId: ProjectId | undefined): void => {
  try {
    if (projectId === undefined) {
      window.localStorage.removeItem(LAST_PROJECT_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId)
  } catch {
    // Persistence is best effort; the server remains authoritative.
  }
}

const withSequence = (snapshot: ShellSnapshot, event: ShellLiveEvent): ShellSnapshot => {
  switch (event._tag) {
    case "project-upserted":
      return {
        ...snapshot,
        snapshotSequence: event.sequence,
        projects: snapshot.projects.some((project) => project.id === event.project.id)
          ? snapshot.projects.map((project) =>
              project.id === event.project.id ? event.project : project,
            )
          : [...snapshot.projects, event.project],
      }
    case "project-removed":
      return {
        ...snapshot,
        snapshotSequence: event.sequence,
        projects: snapshot.projects.filter((project) => project.id !== event.projectId),
        threads: snapshot.threads.filter((thread) => thread.projectId !== event.projectId),
      }
    case "thread-upserted":
      return {
        ...snapshot,
        snapshotSequence: event.sequence,
        threads: snapshot.threads.some((thread) => thread.id === event.thread.id)
          ? snapshot.threads.map((thread) =>
              thread.id === event.thread.id ? event.thread : thread,
            )
          : [...snapshot.threads, event.thread],
      }
    case "thread-removed":
      return {
        ...snapshot,
        snapshotSequence: event.sequence,
        threads: snapshot.threads.filter((thread) => thread.id !== event.threadId),
      }
  }
}

/** Reduce a live shell event. Stale or duplicate sequences keep the current snapshot. */
export const applyShellEvent = (snapshot: ShellSnapshot, event: ShellLiveEvent): ShellSnapshot =>
  event.sequence <= snapshot.snapshotSequence ? snapshot : withSequence(snapshot, event)

type AppliedShellListener = () => void

let appliedShell: ShellSnapshot | undefined
const appliedShellListeners = new Set<AppliedShellListener>()

const emitAppliedShell = (): void => {
  for (const listener of appliedShellListeners) {
    listener()
  }
}

export const getAppliedShell = (): ShellSnapshot | undefined => appliedShell

export const subscribeAppliedShell = (listener: AppliedShellListener): (() => void) => {
  appliedShellListeners.add(listener)
  return () => {
    appliedShellListeners.delete(listener)
  }
}

export const replaceAppliedShell = (next: ShellSnapshot): void => {
  if (Object.is(appliedShell, next)) {
    return
  }
  appliedShell = next
  emitAppliedShell()
}

/**
 * Apply a live event onto the authoritative in-memory shell.
 * `false` means there is no snapshot yet — the stream cursor must not advance.
 */
export const reduceAppliedShellEvent = (event: ShellLiveEvent): boolean => {
  if (appliedShell === undefined) {
    return false
  }
  const next = applyShellEvent(appliedShell, event)
  if (Object.is(next, appliedShell)) {
    return true
  }
  appliedShell = next
  emitAppliedShell()
  return true
}

/** Test helper: drop the in-memory shell between cases. */
export const resetAppliedShell = (): void => {
  appliedShell = undefined
}
