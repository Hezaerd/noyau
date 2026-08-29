import type { ThreadId } from "@noyau/contracts/ids"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import type { ThreadVisits } from "@/lib/thread-visits"
import { threadVisitsAtom, visitAtom } from "@/state/thread-visits"

export const useThreadVisits = (): ThreadVisits => useAppAtomValue(threadVisitsAtom)

export const useThreadVisit = (threadId: ThreadId): number | undefined =>
  useAppAtomValue(visitAtom(threadId))
