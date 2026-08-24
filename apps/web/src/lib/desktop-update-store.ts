import type { DesktopUpdateCheckResult, DesktopUpdateOpenResult } from "@/lib/desktop-bridge"
import { desktopAppVersion, desktopReleaseChannel, isDesktopRuntime } from "@/lib/desktop-bridge"
import {
  desktopUpdateOpenErrorMessage,
  initialDesktopUpdateState,
  type DesktopUpdateState,
} from "@/lib/desktop-update"
import { getDesktopUpdateChannel } from "@/lib/desktop-update-channel-preference"

const listeners = new Set<() => void>()

let state: DesktopUpdateState = { phase: "idle", result: undefined }
let inFlight: Promise<void> | undefined
let autoCheckStarted = false

const emit = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

const setState = (next: DesktopUpdateState): void => {
  state = next
  emit()
}

export const getDesktopUpdateState = (): DesktopUpdateState => state

export const subscribeDesktopUpdateState = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const requestedUpdateChannel = () =>
  desktopReleaseChannel() === "development" ? undefined : getDesktopUpdateChannel()

const checkFromBridge = async (): Promise<DesktopUpdateCheckResult> => {
  const check = window.noyauDesktop?.checkDesktopUpdate
  if (check === undefined) {
    return { _tag: "unsupported", currentVersion: desktopAppVersion() }
  }
  return check(requestedUpdateChannel())
}

export const checkDesktopUpdate = async (): Promise<DesktopUpdateCheckResult> => {
  if (inFlight !== undefined) {
    await inFlight
    return state.result ?? { _tag: "unsupported", currentVersion: desktopAppVersion() }
  }

  setState({ phase: "checking", result: state.result })
  const run = checkFromBridge()
    .then((result) => {
      setState({ phase: "idle", result })
      return result
    })
    .catch(() => {
      const result: DesktopUpdateCheckResult = {
        _tag: "failed",
        currentVersion: state.result?.currentVersion ?? desktopAppVersion(),
        message: "Impossible de vérifier les mises à jour.",
      }
      setState({ phase: "idle", result })
      return result
    })
    .finally(() => {
      inFlight = undefined
    })
  inFlight = run.then(() => undefined)
  return run
}

export const openDesktopInstaller = async (): Promise<DesktopUpdateOpenResult> => {
  const open = window.noyauDesktop?.openDesktopInstaller
  if (open === undefined) {
    return { _tag: "unavailable", reason: "unsupported" }
  }
  setState({ phase: "opening", result: state.result })
  try {
    const result = await open(requestedUpdateChannel())
    if (result._tag === "opened") {
      setState({ phase: "idle", result: state.result })
      return result
    }
    if (result._tag === "failed" || desktopUpdateOpenErrorMessage(result) !== undefined) {
      setState({
        phase: "idle",
        result: {
          _tag: "failed",
          currentVersion: state.result?.currentVersion ?? desktopAppVersion(),
          message: desktopUpdateOpenErrorMessage(result) ?? "Impossible d’ouvrir l’installeur.",
        },
      })
    } else {
      setState({ phase: "idle", result: state.result })
    }
    return result
  } catch {
    const result: DesktopUpdateOpenResult = {
      _tag: "failed",
      message: "Impossible d’ouvrir l’installeur.",
    }
    setState({
      phase: "idle",
      result: {
        _tag: "failed",
        currentVersion: state.result?.currentVersion ?? desktopAppVersion(),
        message: result.message,
      },
    })
    return result
  }
}

export const startDesktopUpdateAutoCheck = (): void => {
  if (autoCheckStarted || !isDesktopRuntime()) {
    return
  }
  autoCheckStarted = true
  const currentVersion = desktopAppVersion()
  if (desktopReleaseChannel() === "development") {
    setState(initialDesktopUpdateState(currentVersion))
    return
  }
  window.setTimeout(() => {
    void checkDesktopUpdate()
  }, 2_000)
}
