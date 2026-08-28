import type { TurnPresentation } from "@noyau/contracts/entities/transcript"
import { GitMergeIcon } from "lucide-react"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { turnPresentationLabel } from "@/lib/turn-presentation"

export function TurnPresentationBubble({
  presentation,
}: {
  readonly presentation: TurnPresentation
}) {
  return (
    <Bubble variant="default" align="end">
      <BubbleContent className="inline-flex items-center gap-2 leading-6 [&_svg:not([class*='size-'])]:size-3.5">
        <GitMergeIcon aria-hidden="true" />
        {turnPresentationLabel(presentation)}
      </BubbleContent>
    </Bubble>
  )
}
