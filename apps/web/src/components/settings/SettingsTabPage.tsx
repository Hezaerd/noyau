import { useParams } from "@tanstack/react-router"
import type { ReactElement } from "react"

import { SETTINGS_PANELS } from "@/components/settings/settings-panels"
import { getSettingsTab, parseSettingsTabId } from "@/lib/settings-catalog"

export function SettingsTabPage(): ReactElement {
  const { tab: tabId } = useParams({ from: "/settings/$tab" })
  const tab = getSettingsTab(parseSettingsTabId(tabId))
  const Panel = SETTINGS_PANELS[tab.id]

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Panel />
    </div>
  )
}
