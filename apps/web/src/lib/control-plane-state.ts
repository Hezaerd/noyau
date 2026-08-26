import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { ProjectId, type ThreadId } from "@noyau/protocol/ids"
import type { ThreadShell } from "@noyau/protocol/shell"
import { DateTime } from "effect"

export { applyShellEvent } from "@noyau/client-runtime/state/shell"

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
