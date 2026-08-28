import { Option, Schema } from "effect"

export const TRANSCRIPT_PAINT_STORAGE_KEY = "noyau:transcript-paint"
export const TRANSCRIPT_PAINT_MODES = ["smooth", "classic"] as const
export type TranscriptPaintMode = (typeof TRANSCRIPT_PAINT_MODES)[number]
export const DEFAULT_TRANSCRIPT_PAINT_MODE: TranscriptPaintMode = "smooth"

export const TRANSCRIPT_PAINT_ITEMS: ReadonlyArray<{
  readonly value: TranscriptPaintMode
  readonly label: string
}> = [
  { value: "smooth", label: "Smooth" },
  { value: "classic", label: "Immediate" },
]

const TranscriptPaintPreference = Schema.Literals(TRANSCRIPT_PAINT_MODES)
const decodeTranscriptPaintPreference = Schema.decodeUnknownOption(TranscriptPaintPreference)

export const isTranscriptPaintMode = (value: string): value is TranscriptPaintMode =>
  TRANSCRIPT_PAINT_MODES.some((mode) => mode === value)

export const parseTranscriptPaintMode = (value: string | null): TranscriptPaintMode =>
  Option.match(decodeTranscriptPaintPreference(value), {
    onNone: () => DEFAULT_TRANSCRIPT_PAINT_MODE,
    onSome: (preference) => preference,
  })

export const readStoredTranscriptPaintMode = (): TranscriptPaintMode => {
  try {
    return parseTranscriptPaintMode(window.localStorage.getItem(TRANSCRIPT_PAINT_STORAGE_KEY))
  } catch {
    return DEFAULT_TRANSCRIPT_PAINT_MODE
  }
}

export const persistTranscriptPaintMode = (mode: TranscriptPaintMode): void => {
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

export const isTranscriptPaintPreferenceDefault = (mode: TranscriptPaintMode): boolean =>
  mode === DEFAULT_TRANSCRIPT_PAINT_MODE
