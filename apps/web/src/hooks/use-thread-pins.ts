import { useAtomValue } from "@effect/atom-react"
import type { ThreadId } from "@noyau/protocol/ids"

import type { ThreadPins } from "@/lib/thread-pins"
import { pinAtom, threadPinsAtom } from "@/state/thread-pins"

export const useThreadPins = (): ThreadPins => useAtomValue(threadPinsAtom)

export const useThreadPinned = (threadId: ThreadId): boolean => useAtomValue(pinAtom(threadId))
