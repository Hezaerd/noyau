import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"
import { ProjectId } from "@noyau/protocol/ids"
import type {
  ProjectShell,
  ShellLiveEvent,
  ShellSnapshot,
  ThreadShell,
} from "@noyau/protocol/shell"
import { createContext } from "react"

export interface ControlPlaneContextValue {
  readonly shell: ShellSnapshot | undefined
  readonly cursor: CursorProviderStatus | undefined
  readonly projects: ReadonlyArray<ProjectShell>
  readonly threads: ReadonlyArray<ThreadShell>
  readonly lastProjectId: ProjectId | undefined
  readonly error: string | undefined
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

export const writeLastProjectId = (projectId: ProjectId): void => {
  try {
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId)
  } catch {
    // Persistence is best effort; the server remains authoritative.
  }
}

export const applyShellEvent = (snapshot: ShellSnapshot, event: ShellLiveEvent): ShellSnapshot => {
  switch (event._tag) {
    case "project-upserted":
      return {
        ...snapshot,
        projects: snapshot.projects.some((project) => project.id === event.project.id)
          ? snapshot.projects.map((project) =>
              project.id === event.project.id ? event.project : project,
            )
          : [...snapshot.projects, event.project],
      }
    case "project-removed":
      return {
        ...snapshot,
        projects: snapshot.projects.filter((project) => project.id !== event.projectId),
        threads: snapshot.threads.filter((thread) => thread.projectId !== event.projectId),
      }
    case "thread-upserted":
      return {
        ...snapshot,
        threads: snapshot.threads.some((thread) => thread.id === event.thread.id)
          ? snapshot.threads.map((thread) =>
              thread.id === event.thread.id ? event.thread : thread,
            )
          : [...snapshot.threads, event.thread],
      }
    case "thread-removed":
      return {
        ...snapshot,
        threads: snapshot.threads.filter((thread) => thread.id !== event.threadId),
      }
  }
}
