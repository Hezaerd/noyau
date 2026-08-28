import { useAtomValue } from "@effect/atom-react"
import type { BoardSnapshot } from "@noyau/contracts/board"
import type { ProjectId } from "@noyau/contracts/ids"
import { useEffect } from "react"

import { boardSnapshotAtom, boardStatusAtom, retainProjectBoard } from "@/state/board"

export const useProjectBoard = (projectId: ProjectId) => {
  useEffect(() => retainProjectBoard(projectId), [projectId])
  return {
    snapshot: useAtomValue(boardSnapshotAtom(projectId)),
    status: useAtomValue(boardStatusAtom(projectId)),
  }
}

export const useProjectBoardSnapshot = (projectId: ProjectId): BoardSnapshot | undefined => {
  useEffect(() => retainProjectBoard(projectId), [projectId])
  return useAtomValue(boardSnapshotAtom(projectId))
}
