import { useEffect, useSyncExternalStore } from "react"

import {
  checkDesktopUpdate,
  getDesktopUpdateState,
  openDesktopInstaller,
  startDesktopUpdateAutoCheck,
  subscribeDesktopUpdateState,
} from "@/lib/desktop-update-store"

export const useDesktopUpdate = () => {
  const state = useSyncExternalStore(
    subscribeDesktopUpdateState,
    getDesktopUpdateState,
    getDesktopUpdateState,
  )

  useEffect(() => {
    startDesktopUpdateAutoCheck()
  }, [])

  return {
    state,
    check: checkDesktopUpdate,
    openInstaller: openDesktopInstaller,
  }
}
