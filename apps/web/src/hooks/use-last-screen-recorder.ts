import { useRouterState } from "@tanstack/react-router"
import { useEffect } from "react"

import { lastScreenFromPathname } from "@/lib/last-screen"
import { rememberLastScreen } from "@/state/shell"

export const useLastScreenRecorder = (): void => {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const search = useRouterState({ select: (state) => state.location.searchStr })

  useEffect(() => {
    const next = lastScreenFromPathname(pathname, search)
    if (next === undefined) {
      return
    }
    rememberLastScreen(next)
  }, [pathname, search])
}
