import type { BoardSnapshot } from "@noyau/contracts/board"
import type { ProjectId } from "@noyau/contracts/ids"
import { useEffect } from "react"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import { boardSnapshotAtom, boardStatusAtom, retainProjectBoard } from "@/state/board"

export const useProjectBoard = (projectId: ProjectId) => {
  useEffect(() => retainProjectBoard(projectId), [projectId])
  return {
    snapshot: useAppAtomValue(boardSnapshotAtom(projectId)),
    status: useAppAtomValue(boardStatusAtom(projectId)),
  }
}

export const useProjectBoardSnapshot = (projectId: ProjectId): BoardSnapshot | undefined => {
  useEffect(() => retainProjectBoard(projectId), [projectId])
  return useAppAtomValue(boardSnapshotAtom(projectId))
}
