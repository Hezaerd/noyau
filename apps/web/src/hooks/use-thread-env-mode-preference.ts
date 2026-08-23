import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import { useSyncExternalStore } from "react"

import {
  getThreadEnvModePreference,
  subscribeThreadEnvModePreference,
} from "@/lib/thread-env-mode-preference"

export const useThreadEnvModePreference = (): ThreadEnvMode =>
  useSyncExternalStore(
    subscribeThreadEnvModePreference,
    getThreadEnvModePreference,
    getThreadEnvModePreference,
  )
