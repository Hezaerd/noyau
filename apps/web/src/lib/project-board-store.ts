import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ProjectId } from "@noyau/protocol/ids"

import { loadBoardSnapshot, subscribeProject, type SubscriptionStatus } from "@/lib/control-plane"

type SnapshotListener = (snapshot: BoardSnapshot) => void
type StatusListener = (status: SubscriptionStatus) => void

interface ProjectBoardEntry {
  readonly snapshotListeners: Set<SnapshotListener>
  readonly statusListeners: Set<StatusListener>
  snapshot: BoardSnapshot | undefined
  stop: (() => void) | undefined
}

const entries = new Map<string, ProjectBoardEntry>()

const ensureEntry = (projectId: ProjectId): ProjectBoardEntry => {
  const existing = entries.get(projectId)
  if (existing !== undefined) {
    return existing
  }
  const entry: ProjectBoardEntry = {
    snapshotListeners: new Set(),
    statusListeners: new Set(),
    snapshot: undefined,
    stop: undefined,
  }
  entry.stop = subscribeProject(projectId, undefined, {
    onSnapshot: (snapshot) => {
      entry.snapshot = snapshot
      for (const listener of entry.snapshotListeners) {
        listener(snapshot)
      }
    },
    onEvent: () => {
      void loadBoardSnapshot(projectId).then((result) => {
        if (!result.ok) {
          return undefined
        }
        entry.snapshot = result.value
        for (const listener of entry.snapshotListeners) {
          listener(result.value)
        }
        return undefined
      })
    },
    onStatus: (status) => {
      for (const listener of entry.statusListeners) {
        listener(status)
      }
    },
  })
  entries.set(projectId, entry)
  return entry
}

const releaseEntry = (projectId: ProjectId, entry: ProjectBoardEntry): void => {
  if (entry.snapshotListeners.size > 0 || entry.statusListeners.size > 0) {
    return
  }
  entry.stop?.()
  entries.delete(projectId)
}

/** Shared project board subscription — one WS stream per projectId, ref-counted. */
export const subscribeProjectBoard = (
  projectId: ProjectId,
  options: {
    readonly onSnapshot: SnapshotListener
    readonly onStatus?: StatusListener
  },
): (() => void) => {
  const entry = ensureEntry(projectId)
  entry.snapshotListeners.add(options.onSnapshot)
  if (options.onStatus !== undefined) {
    entry.statusListeners.add(options.onStatus)
  }
  if (entry.snapshot !== undefined) {
    options.onSnapshot(entry.snapshot)
  }
  return () => {
    entry.snapshotListeners.delete(options.onSnapshot)
    if (options.onStatus !== undefined) {
      entry.statusListeners.delete(options.onStatus)
    }
    releaseEntry(projectId, entry)
  }
}

export const getProjectBoardSnapshot = (projectId: ProjectId): BoardSnapshot | undefined =>
  entries.get(projectId)?.snapshot

/** Test helper. */
export const resetProjectBoardStore = (): void => {
  for (const [projectId, entry] of entries) {
    entry.stop?.()
    entries.delete(projectId)
  }
}
