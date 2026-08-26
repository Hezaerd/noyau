import { memo } from "react"

import { cn } from "@/lib/utils"

const formatCompactDiffCount = (value: number): string => {
  if (value < 1000) {
    return String(value)
  }
  if (value < 1_000_000) {
    const thousands = value / 1000
    return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands)}k`
  }
  if (value < 1_000_000_000) {
    const millions = value / 1_000_000
    return `${millions < 10 ? millions.toFixed(1).replace(/\.0$/, "") : Math.round(millions)}m`
  }
  const billions = value / 1_000_000_000
  return `${billions < 10 ? billions.toFixed(1).replace(/\.0$/, "") : Math.round(billions)}b`
}

export const TurnDiffStatLabel = memo(function TurnDiffStatLabel({
  additions,
  deletions,
  className,
  layout = "aligned",
}: {
  readonly additions: number
  readonly deletions: number
  readonly className?: string
  readonly layout?: "aligned" | "inline"
}) {
  return (
    <span
      role="group"
      aria-label={`${additions} additions, ${deletions} suppressions`}
      className={cn(
        layout === "inline"
          ? "inline-flex items-center gap-1 align-middle tabular-nums"
          : "inline-grid grid-cols-[4ch_4ch] gap-2 align-middle text-right tabular-nums",
        className,
      )}
    >
      <span aria-hidden="true" className="font-mono text-success">
        +{formatCompactDiffCount(additions)}
      </span>
      <span aria-hidden="true" className="font-mono text-destructive">
        -{formatCompactDiffCount(deletions)}
      </span>
    </span>
  )
})
