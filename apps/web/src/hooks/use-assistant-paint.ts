import type { ThreadId, TurnId } from "@noyau/contracts/ids"
import { useSyncExternalStore } from "react"

import {
  getAssistantPaint,
  getAssistantPaintTarget,
  presentedAssistantText,
  resolvePaintedAssistantText,
  subscribeAssistantPaint,
} from "@/lib/assistant-paint"

const subscribeNothing = (): (() => void) => () => undefined
const getNoAssistantPaint = (): undefined => undefined

export const useAssistantPaintTarget = (): ReturnType<typeof getAssistantPaintTarget> => {
  "use no memo"
  return useSyncExternalStore(
    subscribeAssistantPaint,
    getAssistantPaintTarget,
    getAssistantPaintTarget,
  )
}

export const useAssistantPaint = (
  journalText: string,
  threadId: ThreadId,
  turnId: TurnId,
  streaming: boolean,
  flushedPrefix = "",
): string => {
  "use no memo"
  const live = useSyncExternalStore(
    streaming ? subscribeAssistantPaint : subscribeNothing,
    streaming ? getAssistantPaint : getNoAssistantPaint,
    streaming ? getAssistantPaint : getNoAssistantPaint,
  )
  if (!streaming) {
    return presentedAssistantText(journalText, flushedPrefix)
  }
  return resolvePaintedAssistantText(journalText, live, threadId, turnId, flushedPrefix)
}
