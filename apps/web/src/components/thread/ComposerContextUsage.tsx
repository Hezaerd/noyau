import type { ContextUsage } from "@noyau/contracts/entities/context-usage"
import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import {
  contextUsageRatio,
  contextUsageTone,
  formatContextUsage,
  formatTokenCount,
} from "@/lib/context-usage"
import { cn } from "@/lib/utils"

const RING_SIZE = 20
const RING_STROKE = 3
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const toneClassName = {
  default: "text-muted-foreground",
  warning: "text-warning",
  critical: "text-destructive",
} as const

const toneBarClassName = {
  default: "bg-muted-foreground/70",
  warning: "bg-warning",
  critical: "bg-destructive",
} as const

const formatPercentage = (ratio: number): string => {
  const percentage = ratio * 100
  if (percentage < 10) {
    return `${percentage.toFixed(1).replace(/\.0$/, "")}%`
  }
  return `${Math.round(percentage)}%`
}

export function ComposerContextUsage({ usage }: { readonly usage: ContextUsage }): ReactElement {
  const ratio = Math.max(0, Math.min(1, contextUsageRatio(usage)))
  const tone = contextUsageTone(usage)
  const percentage = formatPercentage(ratio)
  const usageLabel = formatContextUsage(usage)
  const remaining = Math.max(usage.window - usage.used, 0)
  const offset = RING_CIRCUMFERENCE * (1 - ratio)

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Context window ${percentage} used`}
            className="size-7 rounded-full text-muted-foreground hover:text-foreground data-pressed:text-foreground"
          />
        }
      >
        <span className="relative flex size-5 items-center justify-center">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="absolute inset-0 size-full -rotate-90 transform-gpu"
          >
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
              className={cn(
                toneClassName[tone],
                "transition-[stroke-dashoffset,stroke] duration-500 ease-out motion-reduce:transition-none",
              )}
            />
          </svg>
        </span>
      </PopoverTrigger>
      <PopoverPopup
        tooltipStyle
        side="top"
        align="end"
        viewportClassName="p-0"
        className="w-64 max-w-none text-left whitespace-normal"
      >
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">Context window</div>
            <div className="text-muted-foreground text-[11px] tabular-nums">
              <span>{percentage}</span>
              <span className="mx-1">·</span>
              <span>{usageLabel}</span>
            </div>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            aria-label="Context window usage"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none",
                toneBarClassName[tone],
              )}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-medium tabular-nums text-muted-foreground">
              {formatTokenCount(remaining)}
            </span>
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  )
}
