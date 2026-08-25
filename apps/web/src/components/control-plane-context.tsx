import type { ProjectId } from "@noyau/protocol/ids"
import type { ProjectShell } from "@noyau/protocol/shell"
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { dismissBootSplash } from "@/lib/boot-splash"
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
import {
  EMPTY_THREAD_SHELLS,
  EMPTY_THREAD_SHELL_INDEX,
  indexThreadShells,
} from "@/lib/thread-shell-index"

const EMPTY_PROJECTS: ReadonlyArray<ProjectShell> = Object.freeze([])

export function ControlPlaneProvider({ children }: { readonly children: ReactNode }) {
  const [shell, setShell] = useState<ControlPlaneContextValue["shell"]>(getAppliedShell)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>()
  const [lastProjectId, setLastProjectId] = useState(readLastProjectId)
  const subscriptionFailure = useDelayedSubscriptionFailure(subscriptionStatus)

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
    if (shell !== undefined || subscriptionFailure !== undefined) {
      dismissBootSplash()
    }
  }, [shell, subscriptionFailure])

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

  const threads = shell?.threads ?? EMPTY_THREAD_SHELLS
  const indexRef = useRef(EMPTY_THREAD_SHELL_INDEX)
  const index = indexThreadShells(threads, indexRef.current)
  indexRef.current = index

  const value = useMemo<ControlPlaneContextValue>(() => {
    return {
      ...index,
      shell,
      cursor: shell?.environment.cursor,
      projects: shell?.projects ?? EMPTY_PROJECTS,
      threads,
      lastProjectId,
      subscriptionStatus,
      selectProject,
    }
  }, [index, lastProjectId, selectProject, shell, subscriptionStatus, threads])

  const publishedRef = useRef(value)
  if (!Object.is(publishedRef.current, value)) {
    publishedRef.current = value
    publishControlPlaneSnapshot(value)
  }

  return <ControlPlaneContext.Provider value={value}>{children}</ControlPlaneContext.Provider>
}
