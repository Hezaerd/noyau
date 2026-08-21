import type { ProjectId } from "@noyau/protocol/ids"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { subscribeShell, type SubscriptionStatus } from "@/lib/control-plane"
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
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>()
  const [lastProjectId, setLastProjectId] = useState(readLastProjectId)

  useEffect(() => {
    return subscribeShell(undefined, {
      onSnapshot: (next) => {
        setShell(next)
      },
      onEvent: (event) => {
        setShell((current) => (current === undefined ? current : applyShellEvent(current, event)))
      },
      onStatus: setSubscriptionStatus,
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
      subscriptionStatus,
      selectProject,
    }
  }, [lastProjectId, selectProject, shell, subscriptionStatus])

  return <ControlPlaneContext.Provider value={value}>{children}</ControlPlaneContext.Provider>
}
