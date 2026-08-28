import { ThreadEnvMode } from "@noyau/contracts/entities/checkout"
import { Option, Schema } from "effect"

export const THREAD_ENV_MODE_STORAGE_KEY = "noyau:default-thread-env-mode"
export const DEFAULT_THREAD_ENV_MODE = "local" satisfies ThreadEnvMode

const decodeThreadEnvMode = Schema.decodeUnknownOption(ThreadEnvMode)

export const parseThreadEnvModePreference = (value: string | null): ThreadEnvMode =>
  Option.getOrElse(decodeThreadEnvMode(value), () => DEFAULT_THREAD_ENV_MODE)

export const isThreadEnvMode = (value: string): value is ThreadEnvMode =>
  value === "local" || value === "worktree"

export const readStoredThreadEnvModePreference = (): ThreadEnvMode => {
  try {
    return parseThreadEnvModePreference(window.localStorage.getItem(THREAD_ENV_MODE_STORAGE_KEY))
  } catch {
    return DEFAULT_THREAD_ENV_MODE
  }
}

export const persistThreadEnvModePreference = (mode: ThreadEnvMode): void => {
  try {
    if (mode === DEFAULT_THREAD_ENV_MODE) {
      window.localStorage.removeItem(THREAD_ENV_MODE_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(THREAD_ENV_MODE_STORAGE_KEY, mode)
  } catch {
    // The preference remains active for this renderer session when storage is unavailable.
  }
}
