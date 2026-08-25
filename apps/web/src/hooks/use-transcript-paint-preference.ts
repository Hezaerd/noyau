import { useSyncExternalStore } from "react"

import {
  getTranscriptPaintMode,
  subscribeTranscriptPaintMode,
  type TranscriptPaintMode,
} from "@/lib/transcript-paint-preference"

export const useTranscriptPaintMode = (): TranscriptPaintMode =>
  useSyncExternalStore(subscribeTranscriptPaintMode, getTranscriptPaintMode, getTranscriptPaintMode)
