import { useAtomValue } from "@effect/atom-react"

import type { TranscriptPaintMode } from "@/lib/transcript-paint-preference"
import { transcriptPaintModeAtom } from "@/state/preferences"

export const useTranscriptPaintMode = (): TranscriptPaintMode =>
  useAtomValue(transcriptPaintModeAtom)
