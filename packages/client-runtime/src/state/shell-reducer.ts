import type { ShellLiveEvent, ShellSnapshot, ThreadShell } from "@noyau/protocol/shell"

const withSequence = (snapshot: ShellSnapshot, event: ShellLiveEvent): ShellSnapshot => {
  switch (event._tag) {
    case "project-upserted":
      return {
        ...snapshot,
        snapshotSequence: event.sequence,
        projects: snapshot.projects.some((project) => project.id === event.project.id)
          ? snapshot.projects.map((project) =>
              project.id === event.project.id ? event.project : project,
            )
          : [...snapshot.projects, event.project],
      }
    case "project-removed":
      return {
        ...snapshot,
        snapshotSequence: event.sequence,
        projects: snapshot.projects.filter((project) => project.id !== event.projectId),
        threads: snapshot.threads.filter((thread) => thread.projectId !== event.projectId),
      }
    case "thread-upserted":
      return {
        ...snapshot,
        snapshotSequence: event.sequence,
        threads: snapshot.threads.some((thread) => thread.id === event.thread.id)
          ? snapshot.threads.map((thread) =>
              thread.id === event.thread.id ? event.thread : thread,
            )
          : [...snapshot.threads, event.thread],
      }
    case "thread-removed":
      return {
        ...snapshot,
        snapshotSequence: event.sequence,
        threads: snapshot.threads.filter((thread) => thread.id !== event.threadId),
      }
  }
}

/** Reduce a live shell event. Stale or duplicate sequences keep the current snapshot. */
export const applyShellEvent = (snapshot: ShellSnapshot, event: ShellLiveEvent): ShellSnapshot =>
  event.sequence <= snapshot.snapshotSequence ? snapshot : withSequence(snapshot, event)

/**
 * Insert a Thread without advancing `snapshotSequence`. If the id is already
 * present, the snapshot is unchanged (authoritative row wins).
 */
export const upsertOptimisticThread = (
  snapshot: ShellSnapshot,
  thread: ThreadShell,
): ShellSnapshot => {
  if (snapshot.threads.some((candidate) => candidate.id === thread.id)) {
    return snapshot
  }
  return { ...snapshot, threads: [...snapshot.threads, thread] }
}
