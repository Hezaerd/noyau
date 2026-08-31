import { useEffect, type ReactNode } from "react"

import { useAppliedShell, useSubscriptionStatus } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { dismissBootSplash } from "@/lib/boot-splash"
import { subscribeShell } from "@/lib/control-plane"
import { hydrateKeybindingsFromServer } from "@/state/keybindings"
import {
  hydrateLastProjectId,
  reduceAppliedShellEvent,
  replaceAppliedShell,
  setSubscriptionStatus,
} from "@/state/shell"

export function ControlPlaneProvider({ children }: { readonly children: ReactNode }) {
  const shell = useAppliedShell()
  const subscriptionStatus = useSubscriptionStatus()
  const subscriptionFailure = useDelayedSubscriptionFailure(subscriptionStatus)

  useEffect(() => {
    hydrateLastProjectId()
    return subscribeShell(undefined, {
      onSnapshot: (next) => {
        replaceAppliedShell(next)
        hydrateKeybindingsFromServer()
      },
      onEvent: (event) => reduceAppliedShellEvent(event),
      onStatus: setSubscriptionStatus,
    })
  }, [])

  useEffect(() => {
    if (shell !== undefined || subscriptionFailure !== undefined) {
      dismissBootSplash()
    }
  }, [shell, subscriptionFailure])

  return children
}
