import { useEffect } from "react"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import { setDesktopBadgeCount } from "@/lib/desktop-attention"
import { waitingThreadCountAtom } from "@/state/sidebar"

export const useWaitingThreadBadge = (): void => {
  const count = useAppAtomValue(waitingThreadCountAtom)

  useEffect(() => {
    setDesktopBadgeCount(count)
  }, [count])
}
