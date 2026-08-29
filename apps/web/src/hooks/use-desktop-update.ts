import { useEffect } from "react"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import {
  checkDesktopUpdate,
  desktopUpdateStateAtom,
  openDesktopInstaller,
  startDesktopUpdateAutoCheck,
} from "@/state/desktop-update"

export const useDesktopUpdate = () => {
  const state = useAppAtomValue(desktopUpdateStateAtom)

  useEffect(() => {
    startDesktopUpdateAutoCheck()
  }, [])

  return {
    state,
    check: checkDesktopUpdate,
    openInstaller: openDesktopInstaller,
  }
}
