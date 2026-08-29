import { useAppAtomValue } from "@/hooks/use-app-atom"
import type { TranscriptPaintMode } from "@/lib/transcript-paint-preference"
import { transcriptPaintModeAtom } from "@/state/preferences"

export const useTranscriptPaintMode = (): TranscriptPaintMode =>
  useAppAtomValue(transcriptPaintModeAtom)
