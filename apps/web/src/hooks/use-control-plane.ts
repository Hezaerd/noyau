import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import type { ThreadShell } from "@noyau/protocol/shell"
import { useCallback, useDebugValue, useRef, useSyncExternalStore } from "react"

import type { ControlPlaneContextValue } from "@/lib/control-plane-state"
import { getControlPlaneSnapshot, subscribeControlPlaneStore } from "@/lib/control-plane-store"
import { EMPTY_THREAD_IDS, EMPTY_THREAD_SHELLS } from "@/lib/thread-shell-index"

export type { ControlPlaneContextValue }

/** Full shell snapshot — re-renders on any control-plane publish. Prefer a selector. */
export const useControlPlane = (): ControlPlaneContextValue =>
  useSyncExternalStore(subscribeControlPlaneStore, getControlPlaneSnapshot, getControlPlaneSnapshot)

export const useThreadShell = (threadId: ThreadId | undefined): ThreadShell | undefined =>
  useControlPlaneSelector((state) =>
    threadId === undefined ? undefined : state.threadsById.get(threadId),
  )

export const useProjectThreadIds = (projectId: ProjectId | undefined): ReadonlyArray<ThreadId> =>
  useControlPlaneSelector((state) =>
    projectId === undefined
      ? EMPTY_THREAD_IDS
      : (state.threadIdsByProjectId.get(projectId) ?? EMPTY_THREAD_IDS),
  )

export const useProjectThreads = (projectId: ProjectId | undefined): ReadonlyArray<ThreadShell> =>
  useControlPlaneSelector((state) =>
    projectId === undefined
      ? EMPTY_THREAD_SHELLS
      : (state.threadsByProjectId.get(projectId) ?? EMPTY_THREAD_SHELLS),
  )

/**
 * Subscribe to a slice of the control plane. Re-renders only when the selected
 * value changes by `Object.is` (stable refs for unchanged `projects` / `cursor`).
 */
export const useControlPlaneSelector = <T>(selector: (state: ControlPlaneContextValue) => T): T => {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const valueRef = useRef<T>(selector(getControlPlaneSnapshot()))

  const getSelection = useCallback((): T => {
    const next = selectorRef.current(getControlPlaneSnapshot())
    if (Object.is(valueRef.current, next)) {
      return valueRef.current
    }
    valueRef.current = next
    return next
  }, [])

  const selected = useSyncExternalStore(subscribeControlPlaneStore, getSelection, getSelection)
  useDebugValue(selected)
  return selected
}
