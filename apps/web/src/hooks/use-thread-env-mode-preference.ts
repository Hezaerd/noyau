import { useAtomValue } from "@effect/atom-react"
import type { ThreadEnvMode } from "@noyau/contracts/entities/checkout"

import { threadEnvModePreferenceAtom } from "@/state/preferences"

export const useThreadEnvModePreference = (): ThreadEnvMode =>
  useAtomValue(threadEnvModePreferenceAtom)
