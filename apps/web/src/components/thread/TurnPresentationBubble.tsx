import type { TurnPresentation } from "@noyau/protocol/entities/transcript"
import { GitMergeIcon } from "lucide-react"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { turnPresentationLabel } from "@/lib/turn-presentation"
import { cn } from "@/lib/utils"

export function TurnPresentationBubble({
  presentation,
  action,
}: {
  readonly presentation: TurnPresentation
  readonly action?: {
    readonly disabled: boolean
    readonly onClick: () => void
  }
}) {
  const label = turnPresentationLabel(presentation)

  return (
    <Bubble variant="default" align="end">
      <BubbleContent
        className={cn(
          "inline-flex items-center gap-2 leading-6",
          "[&_svg:not([class*='size-'])]:size-3.5",
          action !== undefined && "disabled:pointer-events-none disabled:opacity-64",
        )}
        {...(action === undefined
          ? {}
          : {
              render: <button type="button" disabled={action.disabled} onClick={action.onClick} />,
            })}
      >
        <GitMergeIcon aria-hidden="true" />
        {label}
      </BubbleContent>
    </Bubble>
  )
}
