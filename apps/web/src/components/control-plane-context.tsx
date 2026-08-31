import { useRouterState } from "@tanstack/react-router"
import { useEffect, type ReactNode } from "react"

import { useAppliedShell, useLastScreen, useSubscriptionStatus } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { dismissBootSplash } from "@/lib/boot-splash"
import { subscribeShell } from "@/lib/control-plane"
import { resolveStartupDestination, shouldHoldBootSplash } from "@/lib/last-screen"
import { hydrateKeybindingsFromServer } from "@/state/keybindings"
import {
  hydrateLastScreen,
  reduceAppliedShellEvent,
  replaceAppliedShell,
  setSubscriptionStatus,
} from "@/state/shell"

export function ControlPlaneProvider({ children }: { readonly children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const shell = useAppliedShell()
  const lastScreen = useLastScreen()
  const subscriptionStatus = useSubscriptionStatus()
  const subscriptionFailure = useDelayedSubscriptionFailure(subscriptionStatus)
  const destination =
    shell === undefined
      ? undefined
      : resolveStartupDestination(lastScreen, shell.projects, shell.threads)

  useEffect(() => {
    hydrateLastScreen()
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
    if (
      shouldHoldBootSplash({
        pathname,
        shellReady: shell !== undefined,
        subscriptionFailed: subscriptionFailure !== undefined,
        destination,
      })
    ) {
      return
    }
    dismissBootSplash()
  }, [destination, pathname, shell, subscriptionFailure])

  return children
}
