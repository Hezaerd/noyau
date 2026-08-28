import type { ThreadId, TurnId } from "@noyau/contracts/ids"
import type { ThreadAssistantLive } from "@noyau/contracts/thread/live"

import type { TranscriptPaintMode } from "@/lib/transcript-paint-preference"

export type AssistantPaintState = {
  readonly threadId: ThreadId
  readonly turnId: TurnId
  readonly text: string
}

const listeners = new Set<() => void>()

let current: AssistantPaintState | undefined

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const resolvePaintedAssistantText = (
  journalText: string,
  live: AssistantPaintState | undefined,
  threadId: ThreadId,
  turnId: TurnId,
): string => {
  if (live === undefined || live.threadId !== threadId || live.turnId !== turnId) {
    return journalText
  }
  return live.text.length >= journalText.length ? live.text : journalText
}

export const getAssistantPaint = (): AssistantPaintState | undefined => current

export const subscribeAssistantPaint = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const pushAssistantLive = (live: ThreadAssistantLive): void => {
  if (
    current !== undefined &&
    current.threadId === live.threadId &&
    current.turnId === live.turnId &&
    current.text === live.text
  ) {
    return
  }
  current = live
  emitChange()
}

export const clearAssistantPaint = (threadId?: ThreadId): void => {
  if (current === undefined) {
    return
  }
  if (threadId !== undefined && current.threadId !== threadId) {
    return
  }
  current = undefined
  emitChange()
}

export const createFramePainter = (options: {
  readonly mode: TranscriptPaintMode
  readonly schedule: (callback: () => void) => number
  readonly cancel: (id: number) => void
  readonly commit: (text: string) => void
}) => {
  let pending = ""
  let painted = ""
  let frame = 0

  const dispose = (): void => {
    if (frame === 0) {
      return
    }
    options.cancel(frame)
    frame = 0
  }

  const push = (text: string): void => {
    pending = text
    if (options.mode === "classic") {
      dispose()
      if (painted === pending) {
        return
      }
      painted = pending
      options.commit(painted)
      return
    }
    if (frame !== 0) {
      return
    }
    frame = options.schedule(() => {
      frame = 0
      if (painted === pending) {
        return
      }
      painted = pending
      options.commit(painted)
    })
  }

  return { push, dispose }
}
