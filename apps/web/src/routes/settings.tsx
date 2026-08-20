import { createFileRoute, redirect } from "@tanstack/react-router"

import { SettingsRouteLayout } from "@/components/settings/SettingsRouteLayout"
import { DEFAULT_SETTINGS_TAB } from "@/lib/settings-catalog"

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
  component: SettingsRouteLayout,
})
