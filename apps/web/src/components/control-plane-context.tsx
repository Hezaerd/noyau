import type { ProjectId } from "@noyau/protocol/ids"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { subscribeShell, type SubscriptionStatus } from "@/lib/control-plane"
import {
  getAppliedShell,
  reduceAppliedShellEvent,
  replaceAppliedShell,
  subscribeAppliedShell,
  ControlPlaneContext,
  readLastProjectId,
  writeLastProjectId,
  type ControlPlaneContextValue,
} from "@/lib/control-plane-state"
import { publishControlPlaneSnapshot } from "@/lib/control-plane-store"
import { nextLastProjectId } from "@/lib/project-navigation"

export function ControlPlaneProvider({ children }: { readonly children: ReactNode }) {
  const [shell, setShell] = useState<ControlPlaneContextValue["shell"]>(getAppliedShell)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>()
  const [lastProjectId, setLastProjectId] = useState(readLastProjectId)

  useEffect(() => {
    const unsubscribeApplied = subscribeAppliedShell(() => {
      setShell(getAppliedShell())
    })
    const unsubscribeStream = subscribeShell(undefined, {
      onSnapshot: (next) => {
        replaceAppliedShell(next)
      },
      onEvent: (event) => reduceAppliedShellEvent(event),
      onStatus: setSubscriptionStatus,
    })
    return () => {
      unsubscribeStream()
      unsubscribeApplied()
    }
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

  const publishedRef = useRef(value)
  if (!Object.is(publishedRef.current, value)) {
    publishedRef.current = value
    publishControlPlaneSnapshot(value)
  }

  return <ControlPlaneContext.Provider value={value}>{children}</ControlPlaneContext.Provider>
}
