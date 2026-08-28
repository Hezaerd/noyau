import { useAtomValue } from "@effect/atom-react"
import type { ThreadId } from "@noyau/contracts/ids"

import type { ThreadVisits } from "@/lib/thread-visits"
import { threadVisitsAtom, visitAtom } from "@/state/thread-visits"

export const useThreadVisits = (): ThreadVisits => useAtomValue(threadVisitsAtom)

export const useThreadVisit = (threadId: ThreadId): number | undefined =>
  useAtomValue(visitAtom(threadId))
