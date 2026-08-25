import type { ControlPlaneContextValue } from "@/lib/control-plane-state"
import { EMPTY_THREAD_SHELL_INDEX } from "@/lib/thread-shell-index"

type Listener = () => void

const EMPTY: ControlPlaneContextValue = {
  ...EMPTY_THREAD_SHELL_INDEX,
  shell: undefined,
  cursor: undefined,
  projects: [],
  threads: [],
  lastProjectId: undefined,
  subscriptionStatus: undefined,
  selectProject: () => undefined,
}

let snapshot: ControlPlaneContextValue = EMPTY
const listeners = new Set<Listener>()

export const getControlPlaneSnapshot = (): ControlPlaneContextValue => snapshot

export const subscribeControlPlaneStore = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const publishControlPlaneSnapshot = (next: ControlPlaneContextValue): void => {
  if (Object.is(snapshot, next)) {
    return
  }
  snapshot = next
  for (const listener of listeners) {
    listener()
  }
}
