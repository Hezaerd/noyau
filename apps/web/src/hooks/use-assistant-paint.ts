import type { ThreadId, TurnId } from "@noyau/contracts/ids"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { useTranscriptPaintMode } from "@/hooks/use-transcript-paint-preference"
import {
  createFramePainter,
  getAssistantPaint,
  getAssistantPaintTarget,
  presentedAssistantText,
  resolvePaintedAssistantText,
  subscribeAssistantPaint,
} from "@/lib/assistant-paint"

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
  const mode = useTranscriptPaintMode()
  const live = useSyncExternalStore(subscribeAssistantPaint, getAssistantPaint, getAssistantPaint)
  const target = streaming
    ? resolvePaintedAssistantText(journalText, live, threadId, turnId, flushedPrefix)
    : presentedAssistantText(journalText, flushedPrefix)
  const [painted, setPainted] = useState(target)
  const painterRef = useRef<ReturnType<typeof createFramePainter> | undefined>(undefined)
  const targetRef = useRef(target)
  targetRef.current = target

  useEffect(() => {
    const painter = createFramePainter({
      mode,
      schedule: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
      commit: setPainted,
    })
    painterRef.current = painter
    painter.push(targetRef.current)
    return () => {
      painter.dispose()
      if (painterRef.current === painter) {
        painterRef.current = undefined
      }
    }
  }, [mode])

  useEffect(() => {
    painterRef.current?.push(target)
  }, [target])

  return streaming ? painted : presentedAssistantText(journalText, flushedPrefix)
}
