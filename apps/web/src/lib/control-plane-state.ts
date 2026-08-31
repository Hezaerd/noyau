import { DEFAULT_PROVIDER_INSTANCE_ID } from "@noyau/contracts/entities/environment"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import { ProjectId, type ThreadId } from "@noyau/contracts/ids"
import type { ShellLiveEvent, ShellSnapshot, ThreadShell } from "@noyau/contracts/shell"
import { DateTime } from "effect"

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
    case "environment-updated":
      return {
        ...snapshot,
        environment: event.environment,
      }
    case "keybindings-updated":
      return snapshot
  }
}

/** Reduce a live shell event. Stale or duplicate sequences keep the current snapshot. */
export const applyShellEvent = (snapshot: ShellSnapshot, event: ShellLiveEvent): ShellSnapshot =>
  event._tag === "environment-updated" || event._tag === "keybindings-updated"
    ? withSequence(snapshot, event)
    : event.sequence <= snapshot.snapshotSequence
      ? snapshot
      : withSequence(snapshot, event)

export const makeOptimisticThreadShell = (input: {
  readonly id: ThreadId
  readonly projectId: ProjectId
  readonly title: string
  readonly runtimeMode: RuntimeMode
  readonly provider?: ThreadShell["provider"]
  readonly branch?: string | null
  readonly createdAt?: DateTime.Utc
}): ThreadShell => {
  const createdAt = input.createdAt ?? DateTime.nowUnsafe()
  const thread: ThreadShell = {
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    provider: input.provider ?? DEFAULT_PROVIDER_INSTANCE_ID,
    modelSelection: null,
    runtimeMode: input.runtimeMode,
    status: "active",
    latestTurn: null,
    sessionStatus: null,
    lastError: null,
    createdAt,
    listedAt: createdAt,
    updatedAt: createdAt,
  }
  if (input.branch === undefined || input.branch === null || input.branch.trim() === "") {
    return thread
  }
  return { ...thread, branch: input.branch }
}
