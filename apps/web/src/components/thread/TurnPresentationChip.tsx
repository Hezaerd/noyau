import type { TurnPresentation } from "@noyau/protocol/entities/transcript"
import { GitMergeIcon } from "lucide-react"

import { turnPresentationLabel } from "@/lib/turn-presentation"
import { cn } from "@/lib/utils"

export function TurnPresentationChip({
  presentation,
}: {
  readonly presentation: TurnPresentation
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-full border border-border bg-card px-3 py-2",
        "text-sm font-medium text-amber-500",
      )}
    >
      <GitMergeIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{turnPresentationLabel(presentation)}</span>
    </div>
  )
}
