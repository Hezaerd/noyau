import {
  Outlet,
  createFileRoute,
  redirect,
  useCanGoBack,
  useNavigate,
} from "@tanstack/react-router"
import { useCallback, type ReactElement } from "react"

import { useSettingsEscape } from "@/components/settings/settings-layout"
import { SettingsSidebar } from "@/components/settings/SettingsSidebar"
import { SidebarInset } from "@/components/ui/sidebar"
import { DEFAULT_SETTINGS_TAB } from "@/lib/settings-catalog"

function SettingsLayout(): ReactElement {
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

  return (
    <>
      <SettingsSidebar />
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <Outlet />
      </SidebarInset>
    </>
  )
}

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/settings") {
      throw redirect({
        to: "/settings/$tab",
        params: { tab: DEFAULT_SETTINGS_TAB },
        replace: true,
      })
    }
  },
  component: SettingsLayout,
})
