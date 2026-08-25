import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { ProjectId, type ThreadId } from "@noyau/protocol/ids"
import type {
  ProjectShell,
  ShellLiveEvent,
  ShellSnapshot,
  ThreadShell,
} from "@noyau/protocol/shell"
import { DateTime } from "effect"
import { createContext } from "react"

import type { SubscriptionStatus } from "./control-plane"
import type { ThreadShellIndex } from "./thread-shell-index"

export interface ControlPlaneContextValue extends ThreadShellIndex {
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

/**
 * Insert a Thread in the applied shell without moving the stream cursor.
 * An existing Thread (live event already applied) is kept — the optimistic
 * shell must not wipe worktreePath / branch after the receipt races behind
 * `reduceAppliedShellEvent`.
 */
export const upsertAppliedShellThread = (thread: ThreadShell): boolean => {
  if (appliedShell === undefined) {
    return false
  }
  if (appliedShell.threads.some((candidate) => candidate.id === thread.id)) {
    return true
  }
  appliedShell = { ...appliedShell, threads: [...appliedShell.threads, thread] }
  emitAppliedShell()
  return true
}

export const makeOptimisticThreadShell = (input: {
  readonly id: ThreadId
  readonly projectId: ProjectId
  readonly title: string
  readonly runtimeMode: RuntimeMode
  readonly branch?: string | null
  readonly createdAt?: DateTime.Utc
}): ThreadShell => {
  const createdAt = input.createdAt ?? DateTime.nowUnsafe()
  const thread: ThreadShell = {
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    provider: "cursor",
    modelSelection: null,
    runtimeMode: input.runtimeMode,
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  }
  if (input.branch === undefined || input.branch === null || input.branch.trim() === "") {
    return thread
  }
  return { ...thread, branch: input.branch }
}

/** Test helper: drop the in-memory shell between cases. */
export const resetAppliedShell = (): void => {
  appliedShell = undefined
}
