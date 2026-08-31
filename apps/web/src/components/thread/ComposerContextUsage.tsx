import type { ContextUsage } from "@noyau/contracts/entities/context-usage"
import type { ReactElement } from "react"

import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { contextUsageRatio, contextUsageTone, formatContextUsage } from "@/lib/context-usage"
import { cn } from "@/lib/utils"

const RING_SIZE = 20
const RING_STROKE = 2
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const toneClassName = {
  default: "text-muted-foreground",
  warning: "text-warning",
  critical: "text-destructive",
} as const

export function ComposerContextUsage({ usage }: { readonly usage: ContextUsage }): ReactElement {
  const ratio = contextUsageRatio(usage)
  const tone = contextUsageTone(usage)
  const label = formatContextUsage(usage)
  const offset = RING_CIRCUMFERENCE * (1 - ratio)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="meter"
            aria-label={`Context ${label}`}
            aria-valuemin={0}
            aria-valuemax={usage.window}
            aria-valuenow={usage.used}
            className="inline-flex size-5 cursor-pointer items-center justify-center"
          />
        }
      >
        <svg aria-hidden="true" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="size-4.5">
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE}
            className="text-muted-foreground/25"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            className={cn(toneClassName[tone])}
          />
        </svg>
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  )
}
