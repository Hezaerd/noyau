import { Outlet, useCanGoBack, useNavigate } from "@tanstack/react-router"
import { useCallback, type ReactElement } from "react"

import { useSettingsEscape } from "@/hooks/use-settings-escape"

export function SettingsRouteLayout(): ReactElement {
  const navigate = useNavigate()
  const canGoBack = useCanGoBack()
  const navigateBack = useCallback(() => {
    if (canGoBack) {
      window.history.back()
      return
    }
    void navigate({ to: "/" })
  }, [canGoBack, navigate])

  useSettingsEscape(navigateBack)

  return <Outlet />
}
