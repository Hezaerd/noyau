import { useAtomValue } from "@effect/atom-react"
import { useEffect, type ReactNode } from "react"

import { useAppliedShell, useSubscriptionStatus } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { dismissBootSplash } from "@/lib/boot-splash"
import {
  enableLiveShell,
  hydrateLastProjectId,
  pruneOptimisticThreads,
  reconcileShellLastProjectId,
  shellResourceAtom,
} from "@/state/shell"

export function ControlPlaneProvider({ children }: { readonly children: ReactNode }) {
  enableLiveShell()
  useAtomValue(shellResourceAtom)
  const shell = useAppliedShell()
  const subscriptionStatus = useSubscriptionStatus()
  const subscriptionFailure = useDelayedSubscriptionFailure(subscriptionStatus)

  useEffect(() => {
    hydrateLastProjectId()
  }, [])

  useEffect(() => {
    pruneOptimisticThreads()
    reconcileShellLastProjectId(shell)
  }, [shell])

  useEffect(() => {
    if (shell !== undefined || subscriptionFailure !== undefined) {
      dismissBootSplash()
    }
  }, [shell, subscriptionFailure])

  return children
}
