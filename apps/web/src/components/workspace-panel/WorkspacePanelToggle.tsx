import type { ThreadId } from "@noyau/contracts/ids"
import { PanelRightCloseIcon, PanelRightIcon } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppAtomValue } from "@/hooks/use-app-atom"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { toggleWorkspacePanel, workspacePanelAtom } from "@/state/workspace-panel"

export function WorkspacePanelToggle({
  threadId,
  disabled,
}: {
  readonly threadId: ThreadId | undefined
  readonly disabled: boolean
}): ReactElement | null {
  if (threadId === undefined) {
    return null
  }
  return <WorkspacePanelToggleControl disabled={disabled} threadId={threadId} />
}

function WorkspacePanelToggleControl({
  threadId,
  disabled,
}: {
  readonly threadId: ThreadId
  readonly disabled: boolean
}): ReactElement {
  const panel = useAppAtomValue(workspacePanelAtom(threadId))
  useKeybindingHandler(
    "thread.workspace-panel.toggle",
    () => {
      toggleWorkspacePanel(threadId)
    },
    !disabled,
  )

  return (
    <>
      <span aria-hidden="true" className="size-7 shrink-0 sm:size-6" />
      <div
        className="pointer-events-none fixed end-3 top-0 z-50 flex h-(--desktop-titlebar-height) items-center"
        data-slot="workspace-panel-toggle"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={panel.open ? "Hide workspace panel" : "Show workspace panel"}
                aria-pressed={panel.open}
                className="pointer-events-auto text-muted-foreground"
                disabled={disabled}
                size="icon-xs"
                variant="ghost"
                onClick={() => toggleWorkspacePanel(threadId)}
              />
            }
          >
            {panel.open ? <PanelRightCloseIcon /> : <PanelRightIcon />}
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {panel.open ? "Hide workspace panel" : "Show workspace panel"}
          </TooltipPopup>
        </Tooltip>
      </div>
    </>
  )
}
