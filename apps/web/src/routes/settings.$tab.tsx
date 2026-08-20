import { createFileRoute, redirect } from "@tanstack/react-router"

import { SettingsTabPage } from "@/components/settings/SettingsTabPage"
import { DEFAULT_SETTINGS_TAB, parseSettingsTabId } from "@/lib/settings-catalog"

export const Route = createFileRoute("/settings/$tab")({
  beforeLoad: ({ params }) => {
    const tab = parseSettingsTabId(params.tab)
    if (tab !== params.tab) {
      throw redirect({
        to: "/settings/$tab",
        params: { tab: DEFAULT_SETTINGS_TAB },
        replace: true,
      })
    }
  },
  component: SettingsTabPage,
})
