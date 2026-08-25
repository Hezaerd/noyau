import { Option, Schema } from "effect"

export const TRANSCRIPT_PAINT_STORAGE_KEY = "noyau:transcript-paint"
export const TRANSCRIPT_PAINT_MODES = ["smooth", "classic"] as const
export type TranscriptPaintMode = (typeof TRANSCRIPT_PAINT_MODES)[number]
export const DEFAULT_TRANSCRIPT_PAINT_MODE: TranscriptPaintMode = "smooth"

export const TRANSCRIPT_PAINT_ITEMS: ReadonlyArray<{
  readonly value: TranscriptPaintMode
  readonly label: string
}> = [
  { value: "smooth", label: "Fluide" },
  { value: "classic", label: "Immédiat" },
]

const TranscriptPaintPreference = Schema.Literals(TRANSCRIPT_PAINT_MODES)
const decodeTranscriptPaintPreference = Schema.decodeUnknownOption(TranscriptPaintPreference)

const listeners = new Set<() => void>()

let currentMode: TranscriptPaintMode = DEFAULT_TRANSCRIPT_PAINT_MODE
let initialized = false

export const isTranscriptPaintMode = (value: string): value is TranscriptPaintMode =>
  TRANSCRIPT_PAINT_MODES.some((mode) => mode === value)

export const parseTranscriptPaintMode = (value: string | null): TranscriptPaintMode =>
  Option.match(decodeTranscriptPaintPreference(value), {
    onNone: () => DEFAULT_TRANSCRIPT_PAINT_MODE,
    onSome: (preference) => preference,
  })

const readStoredPreference = (): TranscriptPaintMode => {
  try {
    return parseTranscriptPaintMode(window.localStorage.getItem(TRANSCRIPT_PAINT_STORAGE_KEY))
  } catch {
    return DEFAULT_TRANSCRIPT_PAINT_MODE
  }
}

const persistPreference = (mode: TranscriptPaintMode): void => {
  try {
    if (mode === DEFAULT_TRANSCRIPT_PAINT_MODE) {
      window.localStorage.removeItem(TRANSCRIPT_PAINT_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(TRANSCRIPT_PAINT_STORAGE_KEY, mode)
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const initializeTranscriptPaintPreference = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  currentMode = readStoredPreference()
}

export const getTranscriptPaintMode = (): TranscriptPaintMode => currentMode

export const subscribeTranscriptPaintMode = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setTranscriptPaintMode = (mode: TranscriptPaintMode): void => {
  if (mode === currentMode) {
    return
  }
  currentMode = mode
  persistPreference(mode)
  emitChange()
}

export const resetTranscriptPaintPreference = (): void => {
  setTranscriptPaintMode(DEFAULT_TRANSCRIPT_PAINT_MODE)
}

export const isTranscriptPaintPreferenceDefault = (mode: TranscriptPaintMode): boolean =>
  mode === DEFAULT_TRANSCRIPT_PAINT_MODE
