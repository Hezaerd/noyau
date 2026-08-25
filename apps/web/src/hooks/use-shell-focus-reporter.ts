import { useRouterState } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { useLastProjectId } from "@/hooks/use-control-plane"
import { useDiscordPresenceEnabled } from "@/hooks/use-discord-presence-enabled"
import { setShellFocus } from "@/lib/control-plane"
import { resolveShellFocus, type ResolvedShellFocus } from "@/lib/shell-focus"

export const useShellFocusReporter = (): void => {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const lastProjectId = useLastProjectId()
  const enabled = useDiscordPresenceEnabled()
  const lastSent = useRef<string | undefined>(undefined)
  const stickyFocus = useRef<ResolvedShellFocus>({ _tag: "idle" })

  useEffect(() => {
    const resolved = resolveShellFocus(pathname, lastProjectId)
    if (resolved._tag !== "sticky") {
      stickyFocus.current = resolved
    }
    const focus =
      stickyFocus.current._tag === "sticky" ? { _tag: "idle" as const } : stickyFocus.current
    const payload = { enabled, focus }
    const identity = JSON.stringify(payload)
    if (identity === lastSent.current) {
      return
    }
    lastSent.current = identity
    void setShellFocus(payload)
  }, [enabled, lastProjectId, pathname])
}
