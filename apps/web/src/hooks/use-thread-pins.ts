import { useSyncExternalStore } from "react"

import { getThreadPins, subscribeThreadPins, type ThreadPins } from "@/lib/thread-pins"

export const useThreadPins = (): ThreadPins =>
  useSyncExternalStore(subscribeThreadPins, getThreadPins, getThreadPins)
