import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import type { ThreadShell } from "@noyau/protocol/shell"

export const EMPTY_THREAD_IDS: ReadonlyArray<ThreadId> = Object.freeze([])
export const EMPTY_THREAD_SHELLS: ReadonlyArray<ThreadShell> = Object.freeze([])
export const EMPTY_THREADS_BY_ID: ReadonlyMap<ThreadId, ThreadShell> = new Map()
export const EMPTY_THREAD_IDS_BY_PROJECT: ReadonlyMap<ProjectId, ReadonlyArray<ThreadId>> =
  new Map()
export const EMPTY_THREADS_BY_PROJECT: ReadonlyMap<ProjectId, ReadonlyArray<ThreadShell>> =
  new Map()

export interface ThreadShellIndex {
  readonly threadsById: ReadonlyMap<ThreadId, ThreadShell>
  readonly threadIdsByProjectId: ReadonlyMap<ProjectId, ReadonlyArray<ThreadId>>
  readonly threadsByProjectId: ReadonlyMap<ProjectId, ReadonlyArray<ThreadShell>>
}

export const EMPTY_THREAD_SHELL_INDEX: ThreadShellIndex = {
  threadsById: EMPTY_THREADS_BY_ID,
  threadIdsByProjectId: EMPTY_THREAD_IDS_BY_PROJECT,
  threadsByProjectId: EMPTY_THREADS_BY_PROJECT,
}

const idsEqual = (left: ReadonlyArray<ThreadId>, right: ReadonlyArray<ThreadId>): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index])

const shellsEqual = (
  left: ReadonlyArray<ThreadShell>,
  right: ReadonlyArray<ThreadShell>,
): boolean =>
  left.length === right.length && left.every((thread, index) => Object.is(thread, right[index]))

/** Index Thread shells and reuse previous arrays / maps when membership is unchanged. */
export const indexThreadShells = (
  threads: ReadonlyArray<ThreadShell>,
  previous: ThreadShellIndex,
): ThreadShellIndex => {
  if (threads.length === 0) {
    return EMPTY_THREAD_SHELL_INDEX
  }

  const threadsById = new Map<ThreadId, ThreadShell>()
  const idsGrouped = new Map<ProjectId, ThreadId[]>()
  const shellsGrouped = new Map<ProjectId, ThreadShell[]>()

  for (const thread of threads) {
    const shared = previous.threadsById.get(thread.id)
    const next = shared !== undefined && Object.is(shared, thread) ? shared : thread
    threadsById.set(thread.id, next)
    const ids = idsGrouped.get(thread.projectId)
    const shells = shellsGrouped.get(thread.projectId)
    if (ids === undefined || shells === undefined) {
      idsGrouped.set(thread.projectId, [thread.id])
      shellsGrouped.set(thread.projectId, [next])
    } else {
      ids.push(thread.id)
      shells.push(next)
    }
  }

  const threadIdsByProjectId = new Map<ProjectId, ReadonlyArray<ThreadId>>()
  const threadsByProjectId = new Map<ProjectId, ReadonlyArray<ThreadShell>>()
  let idsUnchanged = previous.threadIdsByProjectId.size === idsGrouped.size
  let shellsUnchanged = previous.threadsByProjectId.size === shellsGrouped.size

  for (const [projectId, ids] of idsGrouped) {
    const previousIds = previous.threadIdsByProjectId.get(projectId)
    const nextIds = previousIds !== undefined && idsEqual(previousIds, ids) ? previousIds : ids
    if (!Object.is(nextIds, previousIds)) {
      idsUnchanged = false
    }
    threadIdsByProjectId.set(projectId, nextIds)

    const nextShells = shellsGrouped.get(projectId) ?? EMPTY_THREAD_SHELLS
    const previousShells = previous.threadsByProjectId.get(projectId)
    const sharedShells =
      previousShells !== undefined && shellsEqual(previousShells, nextShells)
        ? previousShells
        : nextShells
    if (!Object.is(sharedShells, previousShells)) {
      shellsUnchanged = false
    }
    threadsByProjectId.set(projectId, sharedShells)
  }

  let byIdUnchanged = previous.threadsById.size === threadsById.size
  if (byIdUnchanged) {
    for (const [threadId, thread] of threadsById) {
      if (!Object.is(previous.threadsById.get(threadId), thread)) {
        byIdUnchanged = false
        break
      }
    }
  }

  if (byIdUnchanged && idsUnchanged && shellsUnchanged) {
    return previous
  }

  return {
    threadsById: byIdUnchanged ? previous.threadsById : threadsById,
    threadIdsByProjectId: idsUnchanged ? previous.threadIdsByProjectId : threadIdsByProjectId,
    threadsByProjectId: shellsUnchanged ? previous.threadsByProjectId : threadsByProjectId,
  }
}
