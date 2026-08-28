import type { ThreadId } from "@noyau/contracts/ids"
import { Option, Schema } from "effect"

export const THREAD_PINS_STORAGE_KEY = "noyau:thread-pins"

const ThreadPinsRecord = Schema.Record(Schema.String, Schema.String)
const decodeThreadPinsRecord = Schema.decodeUnknownOption(ThreadPinsRecord)

/** pinnedAtMs keyed by ThreadId — used to keep pinned Threads above the rest. */
export type ThreadPins = ReadonlyMap<string, number>

export const parseThreadPins = (value: string | null): ThreadPins => {
  if (value === null || value === "") {
    return new Map()
  }
  let parsed: unknown
  try {
    // SAFETY: JSON.parse is unknown until Schema.decodeUnknownOption checks the record.
    parsed = JSON.parse(value) as unknown
  } catch {
    return new Map()
  }
  return Option.match(decodeThreadPinsRecord(parsed), {
    onNone: () => new Map(),
    onSome: (record) => {
      const pins = new Map<string, number>()
      for (const [threadId, iso] of Object.entries(record)) {
        const ms = Date.parse(iso)
        if (Number.isFinite(ms)) {
          pins.set(threadId, ms)
        }
      }
      return pins
    },
  })
}

export const serializeThreadPins = (pins: ThreadPins): string => {
  const record: Record<string, string> = {}
  for (const [threadId, ms] of pins) {
    if (!Number.isFinite(ms)) {
      continue
    }
    record[threadId] = new Date(ms).toISOString()
  }
  return JSON.stringify(record)
}

export const readStoredThreadPins = (): ThreadPins => {
  try {
    return parseThreadPins(window.localStorage.getItem(THREAD_PINS_STORAGE_KEY))
  } catch {
    return new Map()
  }
}

export const persistThreadPins = (pins: ThreadPins): void => {
  try {
    if (pins.size === 0) {
      window.localStorage.removeItem(THREAD_PINS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(THREAD_PINS_STORAGE_KEY, serializeThreadPins(pins))
  } catch {
    // Pins remain active for this renderer session when storage is unavailable.
  }
}

export const isThreadPinned = (threadId: ThreadId | string, pins: ThreadPins): boolean =>
  pins.has(threadId)
