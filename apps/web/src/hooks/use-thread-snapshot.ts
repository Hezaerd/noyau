import { useAtomValue } from "@effect/atom-react"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { ThreadId } from "@noyau/protocol/ids"

import { emptyThreadSnapshotAtom, threadSnapshotAtom } from "@/state/thread-snapshot"

export const useThreadSnapshot = (threadId: ThreadId | undefined): ThreadSnapshot | undefined =>
  useAtomValue(threadId === undefined ? emptyThreadSnapshotAtom : threadSnapshotAtom(threadId))
