import type { BoardSnapshot } from "@noyau/contracts/board"
import type { ProjectId } from "@noyau/contracts/ids"
import { Atom } from "effect/unstable/reactivity"

import { loadBoardSnapshot, subscribeProject, type SubscriptionStatus } from "@/lib/control-plane"
import { appAtomRegistry } from "@/state/atom-registry"

export const boardSnapshotAtom = Atom.family((projectId: ProjectId) =>
  Atom.make<BoardSnapshot | undefined>(undefined).pipe(
    Atom.withLabel(`board:snapshot:${projectId}`),
  ),
)

export const boardStatusAtom = Atom.family((projectId: ProjectId) =>
  Atom.make<SubscriptionStatus | undefined>(undefined).pipe(
    Atom.withLabel(`board:status:${projectId}`),
  ),
)

interface BoardWriter {
  count: number
  generation: number
  stop: (() => void) | undefined
}

const writers = new Map<ProjectId, BoardWriter>()

const replaceBoardSnapshot = (projectId: ProjectId, snapshot: BoardSnapshot): void => {
  appAtomRegistry.set(boardSnapshotAtom(projectId), snapshot)
}

const applyBoardSnapshotIfCurrent = (
  projectId: ProjectId,
  writer: BoardWriter,
  generation: number,
  snapshot: BoardSnapshot,
): void => {
  if (writers.get(projectId) !== writer || writer.generation !== generation) {
    return
  }
  replaceBoardSnapshot(projectId, snapshot)
}

/** One subscribeProject per Project, ref-counted across Tableau and Composer. */
export const retainProjectBoard = (projectId: ProjectId): (() => void) => {
  const existing = writers.get(projectId)
  if (existing !== undefined) {
    existing.count += 1
    return () => releaseProjectBoard(projectId)
  }
  const writer: BoardWriter = { count: 1, generation: 0, stop: undefined }
  writer.stop = subscribeProject(projectId, undefined, {
    onSnapshot: (snapshot) => {
      writer.generation += 1
      applyBoardSnapshotIfCurrent(projectId, writer, writer.generation, snapshot)
    },
    onEvent: () => {
      writer.generation += 1
      const generation = writer.generation
      void loadBoardSnapshot(projectId).then((result) => {
        if (!result.ok) {
          return undefined
        }
        applyBoardSnapshotIfCurrent(projectId, writer, generation, result.value)
        return undefined
      })
    },
    onStatus: (status) => {
      if (writers.get(projectId) !== writer) {
        return
      }
      appAtomRegistry.set(boardStatusAtom(projectId), status)
    },
  })
  writers.set(projectId, writer)
  return () => releaseProjectBoard(projectId)
}

const releaseProjectBoard = (projectId: ProjectId): void => {
  const writer = writers.get(projectId)
  if (writer === undefined) {
    return
  }
  writer.count -= 1
  if (writer.count > 0) {
    return
  }
  writer.generation += 1
  writer.stop?.()
  writers.delete(projectId)
}

export const getProjectBoardSnapshot = (projectId: ProjectId): BoardSnapshot | undefined =>
  appAtomRegistry.get(boardSnapshotAtom(projectId))

export const resetProjectBoardForTests = (): void => {
  for (const [projectId, writer] of writers) {
    writer.stop?.()
    writers.delete(projectId)
    appAtomRegistry.set(boardSnapshotAtom(projectId), undefined)
    appAtomRegistry.set(boardStatusAtom(projectId), undefined)
  }
}
