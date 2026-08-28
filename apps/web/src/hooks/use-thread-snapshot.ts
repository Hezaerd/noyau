import { useAtomValue } from "@effect/atom-react"
import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { ThreadId } from "@noyau/contracts/ids"

import { emptyThreadSnapshotAtom, threadSnapshotAtom } from "@/state/thread-snapshot"

export const useThreadSnapshot = (threadId: ThreadId | undefined): ThreadSnapshot | undefined =>
  useAtomValue(threadId === undefined ? emptyThreadSnapshotAtom : threadSnapshotAtom(threadId))
