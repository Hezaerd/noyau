import type { ThreadId } from "@noyau/contracts/ids"
import { PanelBottomCloseIcon, PanelBottomIcon } from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useAppAtomValue } from "@/hooks/use-app-atom"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
import { toggleThreadComposer, threadComposerOpenAtom } from "@/state/thread-composer"

export function ThreadComposerToggle({
  threadId,
  disabled,
}: {
  readonly threadId: ThreadId | undefined
  readonly disabled: boolean
}): ReactElement | null {
  if (threadId === undefined) {
    return null
  }
  return <ThreadComposerToggleControl disabled={disabled} threadId={threadId} />
}

function ThreadComposerToggleControl({
  threadId,
  disabled,
}: {
  readonly threadId: ThreadId
  readonly disabled: boolean
}): ReactElement {
  const open = useAppAtomValue(threadComposerOpenAtom(threadId))
  useKeybindingHandler(
    "thread.composer.toggle",
    () => {
      toggleThreadComposer(threadId)
    },
    !disabled,
  )

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={open ? "Hide composer" : "Show composer"}
            aria-pressed={open}
            className="text-muted-foreground"
            disabled={disabled}
            size="icon-xs"
            variant="ghost"
            onClick={() => toggleThreadComposer(threadId)}
          />
        }
      >
        {open ? <PanelBottomCloseIcon /> : <PanelBottomIcon />}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{open ? "Hide composer" : "Show composer"}</TooltipPopup>
    </Tooltip>
  )
}
