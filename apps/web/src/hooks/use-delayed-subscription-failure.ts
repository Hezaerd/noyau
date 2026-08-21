import { useEffect, useState } from "react"

import type { AppFailure } from "@/lib/app-failure"
import type { SubscriptionStatus } from "@/lib/control-plane"

export const useDelayedSubscriptionFailure = (
  status: SubscriptionStatus | undefined,
  delay = 750,
): AppFailure | undefined => {
  const [failure, setFailure] = useState<AppFailure>()

  useEffect(() => {
    if (status?._tag !== "Reconnecting") {
      setFailure(undefined)
      return
    }
    const timeout = window.setTimeout(() => setFailure(status.failure), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, status])

  return failure
}
