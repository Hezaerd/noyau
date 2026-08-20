import { ProjectId } from "@noyau/protocol/ids"
import type {
  ProjectShell,
  ShellLiveEvent,
  ShellSnapshot,
  ThreadShell,
} from "@noyau/protocol/shell"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { subscribeShell } from "@/lib/control-plane"

const LAST_PROJECT_STORAGE_KEY = "noyau.last-project-id"

export interface ControlPlaneContextValue {
  readonly shell: ShellSnapshot | undefined
  readonly projects: ReadonlyArray<ProjectShell>
  readonly threads: ReadonlyArray<ThreadShell>
  readonly lastProjectId: ProjectId | undefined
  readonly error: string | undefined
  readonly selectProject: (projectId: ProjectId) => void
}

const readLastProjectId = (): ProjectId | undefined => {
  try {
    const value = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY)
    return value === null ? undefined : ProjectId.make(value)
  } catch {
    return undefined
  }
}

const writeLastProjectId = (projectId: ProjectId): void => {
  try {
    window.localStorage.setItem(LAST_PROJECT_STORAGE_KEY, projectId)
  } catch {
    // Persistence is best effort; the server remains authoritative.
  }
}

const applyShellEvent = (snapshot: ShellSnapshot, event: ShellLiveEvent): ShellSnapshot => {
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

export function ControlPlaneProvider({ children }: { readonly children: ReactNode }) {
  const [shell, setShell] = useState<ShellSnapshot>()
  const [error, setError] = useState<string>()
  const [lastProjectId, setLastProjectId] = useState<ProjectId | undefined>(readLastProjectId)

  useEffect(() => {
    return subscribeShell(undefined, {
      onSnapshot: (next) => {
        setShell(next)
        setError(undefined)
      },
      onEvent: (event) => {
        setShell((current) => (current === undefined ? current : applyShellEvent(current, event)))
      },
      onError: setError,
    })
  }, [])

  useEffect(() => {
    if (shell === undefined || shell.projects.length === 0) {
      return
    }
    const storedProject = shell.projects.find((project) => project.id === lastProjectId)
    if (storedProject !== undefined) {
      return
    }
    const firstProject = shell.projects[0]
    if (firstProject !== undefined) {
      setLastProjectId(firstProject.id)
      writeLastProjectId(firstProject.id)
    }
  }, [lastProjectId, shell])

  const selectProject = useCallback((projectId: ProjectId) => {
    setLastProjectId(projectId)
    writeLastProjectId(projectId)
  }, [])

  const value = useMemo<ControlPlaneContextValue>(() => {
    return {
      shell,
      projects: shell?.projects ?? [],
      threads: shell?.threads ?? [],
      lastProjectId,
      error,
      selectProject,
    }
  }, [error, lastProjectId, selectProject, shell])

  return <ControlPlaneContext.Provider value={value}>{children}</ControlPlaneContext.Provider>
}

const ControlPlaneContext = createContext<ControlPlaneContextValue | undefined>(undefined)

export const useControlPlane = (): ControlPlaneContextValue => {
  const value = useContext(ControlPlaneContext)
  if (value === undefined) {
    throw new Error("useControlPlane must be used inside ControlPlaneProvider")
  }
  return value
}
