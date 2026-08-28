import { Atom } from "effect/unstable/reactivity"

import type { DesktopUpdateCheckResult, DesktopUpdateOpenResult } from "@/lib/desktop-bridge"
import { desktopAppVersion, desktopReleaseChannel, isDesktopRuntime } from "@/lib/desktop-bridge"
import {
  desktopUpdateOpenErrorMessage,
  initialDesktopUpdateState,
  type DesktopUpdateState,
} from "@/lib/desktop-update"
import { appAtomRegistry } from "@/state/atom-registry"

const initialRendererDesktopUpdateState = (): DesktopUpdateState =>
  desktopReleaseChannel() === "development"
    ? initialDesktopUpdateState(desktopAppVersion())
    : { phase: "idle", result: undefined }

export const desktopUpdateStateAtom = Atom.make<DesktopUpdateState>(
  initialRendererDesktopUpdateState(),
).pipe(Atom.keepAlive, Atom.withLabel("chrome:desktop-update"))

let inFlight: Promise<void> | undefined
let autoCheckStarted = false

const setState = (next: DesktopUpdateState): void => {
  appAtomRegistry.set(desktopUpdateStateAtom, next)
}

export const getDesktopUpdateState = (): DesktopUpdateState =>
  appAtomRegistry.get(desktopUpdateStateAtom)

const checkFromBridge = async (): Promise<DesktopUpdateCheckResult> => {
  const check = window.noyauDesktop?.checkDesktopUpdate
  if (check === undefined) {
    return { _tag: "unsupported", currentVersion: desktopAppVersion() }
  }
  return check()
}

export const checkDesktopUpdate = async (): Promise<DesktopUpdateCheckResult> => {
  const state = getDesktopUpdateState()
  if (inFlight !== undefined) {
    await inFlight
    return (
      getDesktopUpdateState().result ?? {
        _tag: "unsupported",
        currentVersion: desktopAppVersion(),
      }
    )
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
        currentVersion: getDesktopUpdateState().result?.currentVersion ?? desktopAppVersion(),
        message: "Unable to check for updates.",
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
  setState({ phase: "opening", result: getDesktopUpdateState().result })
  try {
    const result = await open()
    const current = getDesktopUpdateState()
    if (result._tag === "opened") {
      setState({ phase: "idle", result: current.result })
      return result
    }
    if (result._tag === "failed" || desktopUpdateOpenErrorMessage(result) !== undefined) {
      setState({
        phase: "idle",
        result: {
          _tag: "failed",
          currentVersion: current.result?.currentVersion ?? desktopAppVersion(),
          message: desktopUpdateOpenErrorMessage(result) ?? "Unable to open the installer.",
        },
      })
    } else {
      setState({ phase: "idle", result: current.result })
    }
    return result
  } catch {
    const result: DesktopUpdateOpenResult = {
      _tag: "failed",
      message: "Unable to open the installer.",
    }
    setState({
      phase: "idle",
      result: {
        _tag: "failed",
        currentVersion: getDesktopUpdateState().result?.currentVersion ?? desktopAppVersion(),
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
