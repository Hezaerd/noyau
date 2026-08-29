import type { ThreadId } from "@noyau/contracts/ids"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import type { ThreadPins } from "@/lib/thread-pins"
import { pinAtom, threadPinsAtom } from "@/state/thread-pins"

export const useThreadPins = (): ThreadPins => useAppAtomValue(threadPinsAtom)

export const useThreadPinned = (threadId: ThreadId): boolean => useAppAtomValue(pinAtom(threadId))
