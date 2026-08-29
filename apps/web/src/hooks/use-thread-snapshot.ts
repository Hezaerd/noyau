import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { ThreadId } from "@noyau/contracts/ids"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import { emptyThreadSnapshotAtom, threadSnapshotAtom } from "@/state/thread-snapshot"

export const useThreadSnapshot = (threadId: ThreadId | undefined): ThreadSnapshot | undefined =>
  useAppAtomValue(threadId === undefined ? emptyThreadSnapshotAtom : threadSnapshotAtom(threadId))
