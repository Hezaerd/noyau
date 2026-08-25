import { useAtomValue } from "@effect/atom-react"
import { useEffect } from "react"

import {
  checkDesktopUpdate,
  desktopUpdateStateAtom,
  openDesktopInstaller,
  startDesktopUpdateAutoCheck,
} from "@/state/desktop-update"

export const useDesktopUpdate = () => {
  const state = useAtomValue(desktopUpdateStateAtom)

  useEffect(() => {
    startDesktopUpdateAutoCheck()
  }, [])

  return {
    state,
    check: checkDesktopUpdate,
    openInstaller: openDesktopInstaller,
  }
}
