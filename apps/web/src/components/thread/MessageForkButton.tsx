import { GitForkIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"

export function MessageForkButton({
  onFork,
  pending = false,
}: {
  readonly onFork: () => void
  readonly pending?: boolean
}) {
  const label = pending ? "Forking response" : "Fork from this response"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            disabled={pending}
            onClick={onFork}
          />
        }
      >
        <GitForkIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  )
}
