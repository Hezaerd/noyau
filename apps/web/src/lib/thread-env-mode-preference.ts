import { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import { Option, Schema } from "effect"

export const THREAD_ENV_MODE_STORAGE_KEY = "noyau:default-thread-env-mode"
export const DEFAULT_THREAD_ENV_MODE = "local" satisfies ThreadEnvMode

const decodeThreadEnvMode = Schema.decodeUnknownOption(ThreadEnvMode)

const listeners = new Set<() => void>()

let currentMode: ThreadEnvMode = DEFAULT_THREAD_ENV_MODE
let initialized = false

export const parseThreadEnvModePreference = (value: string | null): ThreadEnvMode =>
  Option.getOrElse(decodeThreadEnvMode(value), () => DEFAULT_THREAD_ENV_MODE)

export const isThreadEnvMode = (value: string): value is ThreadEnvMode =>
  value === "local" || value === "worktree"

const readStoredPreference = (): ThreadEnvMode => {
  try {
    return parseThreadEnvModePreference(window.localStorage.getItem(THREAD_ENV_MODE_STORAGE_KEY))
  } catch {
    return DEFAULT_THREAD_ENV_MODE
  }
}

const persistPreference = (mode: ThreadEnvMode): void => {
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

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const initializeThreadEnvModePreference = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  currentMode = readStoredPreference()
}

export const getThreadEnvModePreference = (): ThreadEnvMode => currentMode

export const subscribeThreadEnvModePreference = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const setThreadEnvModePreference = (mode: ThreadEnvMode): void => {
  if (mode === currentMode) {
    return
  }
  currentMode = mode
  persistPreference(mode)
  emitChange()
}
