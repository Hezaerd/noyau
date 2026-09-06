import { ArrowUpCircleIcon } from "lucide-react"
import { type ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { toastManager } from "@/components/ui/toast"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useDesktopUpdate } from "@/hooks/use-desktop-update"
import { desktopReleaseChannel, isDesktopRuntime } from "@/lib/desktop-bridge"
import {
  desktopUpdateHasInstaller,
  desktopUpdateOpenErrorMessage,
  desktopUpdateStatusLabel,
} from "@/lib/desktop-update"

export function DesktopUpdateSidebarButton(): ReactElement | null {
  const { state, openInstaller } = useDesktopUpdate()
  if (!isDesktopRuntime() || !desktopUpdateHasInstaller(state.result)) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open the Noyau installer"
            loading={state.phase === "opening"}
            className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={() => {
              void openInstaller().then((result) => {
                const message = desktopUpdateOpenErrorMessage(result)
                if (message !== undefined) {
                  toastManager.add({ title: message, type: "error" })
                }
                return undefined
              })
            }}
          >
            <ArrowUpCircleIcon />
          </Button>
        }
      />
      <TooltipPopup side="top">
        {desktopUpdateStatusLabel(state, desktopReleaseChannel())}
      </TooltipPopup>
    </Tooltip>
  )
}
