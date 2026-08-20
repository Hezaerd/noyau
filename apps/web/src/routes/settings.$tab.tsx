import { createFileRoute, redirect } from "@tanstack/react-router"
import { RotateCcwIcon } from "lucide-react"
import type { ReactElement } from "react"

import { SETTINGS_PANELS, useSettingsTabRestore } from "@/components/settings/settings-panels"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { DEFAULT_SETTINGS_TAB, getSettingsTab, parseSettingsTabId } from "@/lib/settings-catalog"

function SettingsTabPage(): ReactElement {
  const { tab: tabId } = Route.useParams()
  const tab = getSettingsTab(parseSettingsTabId(tabId))
  const Panel = SETTINGS_PANELS[tab.id]
  const { canRestore, restore } = useSettingsTabRestore(tab.id)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        className="drag-region sticky top-0 z-30 flex h-(--desktop-titlebar-height) min-h-(--desktop-titlebar-height) shrink-0 items-center gap-3 border-b border-border/70 bg-background/88 px-3 backdrop-blur-xl sm:px-5"
        data-desktop-page-titlebar=""
      >
        <SidebarTrigger className="-ml-1 text-muted-foreground" />
        <Separator orientation="vertical" className="h-4" />
        <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Paramètres</span>
          <span className="text-muted-foreground/50">/</span>
          <span className="truncate font-medium tracking-[-0.015em]">{tab.label}</span>
        </nav>
        {tab.restorable ? (
          <div className="ms-auto">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={!canRestore}
              onClick={restore}
            >
              <RotateCcwIcon data-icon="inline-start" />
              Restaurer les défauts
            </Button>
          </div>
        ) : null}
      </header>
      <Panel />
    </div>
  )
}

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
