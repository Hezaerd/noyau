import type { ThreadId, TurnId } from "@noyau/contracts/ids"
import type { ThreadAssistantLive } from "@noyau/contracts/thread/live"

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

/**
 * Live paint and some journal rows replay every assistant chunk of the Turn.
 * Keep only the text that is not already visible in earlier rows.
 */
export const presentedAssistantText = (text: string, flushedPrefix: string): string => {
  if (flushedPrefix.length === 0 || text.length === 0) {
    return text
  }
  if (text.startsWith(flushedPrefix)) {
    return text.slice(flushedPrefix.length)
  }
  if (text.endsWith(flushedPrefix)) {
    return text.slice(0, text.length - flushedPrefix.length)
  }
  if (flushedPrefix.length >= 32) {
    const index = text.indexOf(flushedPrefix)
    if (index !== -1) {
      return `${text.slice(0, index)}${text.slice(index + flushedPrefix.length)}`
    }
  }
  return text
}

const liveReplaysFlushedPrefix = (liveText: string, flushedPrefix: string): boolean =>
  flushedPrefix.length === 0 ||
  liveText.startsWith(flushedPrefix) ||
  liveText.endsWith(flushedPrefix) ||
  (flushedPrefix.length >= 32 && liveText.includes(flushedPrefix))

export const resolvePaintedAssistantText = (
  journalText: string,
  live: AssistantPaintState | undefined,
  threadId: ThreadId,
  turnId: TurnId,
  flushedPrefix = "",
): string => {
  const journalPresented = presentedAssistantText(journalText, flushedPrefix)
  if (live === undefined || live.threadId !== threadId || live.turnId !== turnId) {
    return journalPresented
  }
  if (!liveReplaysFlushedPrefix(live.text, flushedPrefix)) {
    return journalPresented
  }
  const livePresented = presentedAssistantText(live.text, flushedPrefix)
  return livePresented.length >= journalPresented.length ? livePresented : journalPresented
}

export const getAssistantPaint = (): AssistantPaintState | undefined => current

/** Stable while only the live text grows, so a target subscription can skip token paints. */
let paintTarget: Pick<AssistantPaintState, "threadId" | "turnId"> | undefined

export const getAssistantPaintTarget = ():
  | Pick<AssistantPaintState, "threadId" | "turnId">
  | undefined => {
  if (current === undefined) {
    paintTarget = undefined
    return undefined
  }
  if (
    paintTarget !== undefined &&
    paintTarget.threadId === current.threadId &&
    paintTarget.turnId === current.turnId
  ) {
    return paintTarget
  }
  paintTarget = { threadId: current.threadId, turnId: current.turnId }
  return paintTarget
}

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
