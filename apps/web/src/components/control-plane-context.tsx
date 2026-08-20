import type { ProjectId } from "@noyau/protocol/ids"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { subscribeShell } from "@/lib/control-plane"
import {
  applyShellEvent,
  ControlPlaneContext,
  readLastProjectId,
  writeLastProjectId,
  type ControlPlaneContextValue,
} from "@/lib/control-plane-state"
import { nextLastProjectId } from "@/lib/project-navigation"

export function ControlPlaneProvider({ children }: { readonly children: ReactNode }) {
  const [shell, setShell] = useState<ControlPlaneContextValue["shell"]>()
  const [error, setError] = useState<string>()
  const [lastProjectId, setLastProjectId] = useState(readLastProjectId)

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
    if (shell === undefined) {
      return
    }
    const next = nextLastProjectId(shell.projects, lastProjectId)
    if (next === lastProjectId) {
      return
    }
    setLastProjectId(next)
    writeLastProjectId(next)
  }, [lastProjectId, shell])

  const selectProject = useCallback((projectId: ProjectId) => {
    setLastProjectId(projectId)
    writeLastProjectId(projectId)
  }, [])

  const value = useMemo<ControlPlaneContextValue>(() => {
    return {
      shell,
      cursor: shell?.environment.cursor,
      projects: shell?.projects ?? [],
      threads: shell?.threads ?? [],
      lastProjectId,
      error,
      selectProject,
    }
  }, [error, lastProjectId, selectProject, shell])

  return <ControlPlaneContext.Provider value={value}>{children}</ControlPlaneContext.Provider>
}
