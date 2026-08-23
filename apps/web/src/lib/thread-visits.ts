import type { ThreadId } from "@noyau/protocol/ids"
import { Option, Schema } from "effect"

export const THREAD_VISITS_STORAGE_KEY = "noyau:thread-visits"

const ThreadVisitsRecord = Schema.Record(Schema.String, Schema.String)
const decodeThreadVisitsRecord = Schema.decodeUnknownOption(ThreadVisitsRecord)

export type ThreadVisits = ReadonlyMap<string, number>

const listeners = new Set<() => void>()

let current: ThreadVisits = new Map()
let initialized = false

export const parseThreadVisits = (value: string | null): ThreadVisits => {
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
  return Option.match(decodeThreadVisitsRecord(parsed), {
    onNone: () => new Map(),
    onSome: (record) => {
      const visits = new Map<string, number>()
      for (const [threadId, iso] of Object.entries(record)) {
        const ms = Date.parse(iso)
        if (Number.isFinite(ms)) {
          visits.set(threadId, ms)
        }
      }
      return visits
    },
  })
}

export const serializeThreadVisits = (visits: ThreadVisits): string => {
  const record: Record<string, string> = {}
  for (const [threadId, ms] of visits) {
    if (!Number.isFinite(ms)) {
      continue
    }
    record[threadId] = new Date(ms).toISOString()
  }
  return JSON.stringify(record)
}

export const nextVisitedAtMs = (
  currentMs: number | undefined,
  candidateMs: number,
): number | undefined => {
  if (!Number.isFinite(candidateMs)) {
    return currentMs
  }
  if (currentMs !== undefined && Number.isFinite(currentMs) && currentMs >= candidateMs) {
    return currentMs
  }
  return candidateMs
}

const readStoredVisits = (): ThreadVisits => {
  try {
    return parseThreadVisits(window.localStorage.getItem(THREAD_VISITS_STORAGE_KEY))
  } catch {
    return new Map()
  }
}

const persistVisits = (visits: ThreadVisits): void => {
  try {
    if (visits.size === 0) {
      window.localStorage.removeItem(THREAD_VISITS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(THREAD_VISITS_STORAGE_KEY, serializeThreadVisits(visits))
  } catch {
    // Visits remain active for this renderer session when storage is unavailable.
  }
}

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const initializeThreadVisits = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  current = readStoredVisits()
}

export const getThreadVisits = (): ThreadVisits => current

export const subscribeThreadVisits = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const markThreadVisited = (threadId: ThreadId, visitedAtMs: number): void => {
  const nextMs = nextVisitedAtMs(current.get(threadId), visitedAtMs)
  if (nextMs === undefined || nextMs === current.get(threadId)) {
    return
  }
  const next = new Map(current)
  next.set(threadId, nextMs)
  current = next
  persistVisits(current)
  emitChange()
}
