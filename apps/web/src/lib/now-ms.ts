const listeners = new Set<(nowMs: number) => void>()

let timeoutId: ReturnType<typeof setTimeout> | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

const emit = (): void => {
  const nowMs = Date.now()
  for (const listener of listeners) {
    listener(nowMs)
  }
}

const stopTicker = (): void => {
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

const startTicker = (): void => {
  if (timeoutId !== null || intervalId !== null) {
    return
  }
  const delay = 1_000 - (Date.now() % 1_000)
  timeoutId = setTimeout(() => {
    timeoutId = null
    emit()
    intervalId = setInterval(emit, 1_000)
  }, delay)
}

export const subscribeNowMs = (listener: (nowMs: number) => void): (() => void) => {
  listeners.add(listener)
  startTicker()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopTicker()
    }
  }
}
