import type { ThreadEnvMode } from "@noyau/contracts/entities/checkout"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import { threadEnvModePreferenceAtom } from "@/state/preferences"

export const useThreadEnvModePreference = (): ThreadEnvMode =>
  useAppAtomValue(threadEnvModePreferenceAtom)
