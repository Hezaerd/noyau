import { Option, Schema } from "effect"

export const THREAD_VISITS_STORAGE_KEY = "noyau:thread-visits"

const ThreadVisitsRecord = Schema.Record(Schema.String, Schema.String)
const decodeThreadVisitsRecord = Schema.decodeUnknownOption(ThreadVisitsRecord)

export type ThreadVisits = ReadonlyMap<string, number>

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

export const readStoredThreadVisits = (): ThreadVisits => {
  try {
    return parseThreadVisits(window.localStorage.getItem(THREAD_VISITS_STORAGE_KEY))
  } catch {
    return new Map()
  }
}

export const persistThreadVisits = (visits: ThreadVisits): void => {
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
