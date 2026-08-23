import { useSyncExternalStore } from "react"

import { getThreadVisits, subscribeThreadVisits, type ThreadVisits } from "@/lib/thread-visits"

export const useThreadVisits = (): ThreadVisits =>
  useSyncExternalStore(subscribeThreadVisits, getThreadVisits, getThreadVisits)
