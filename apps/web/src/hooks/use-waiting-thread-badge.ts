import { useAtomValue } from "@effect/atom-react"
import { useEffect } from "react"

import { setDesktopBadgeCount } from "@/lib/desktop-attention"
import { waitingThreadCountAtom } from "@/state/sidebar"

export const useWaitingThreadBadge = (): void => {
  const count = useAtomValue(waitingThreadCountAtom)

  useEffect(() => {
    setDesktopBadgeCount(count)
  }, [count])
}
