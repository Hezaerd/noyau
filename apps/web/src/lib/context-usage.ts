import type { ContextUsage } from "@noyau/contracts/entities/context-usage"

export type ContextUsageTone = "default" | "warning" | "critical"

const formatScaled = (value: number, suffix: string): string => {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}${suffix}`
}

/** Compact token count for the composer ring tooltip. */
export const formatTokenCount = (value: number): string => {
  if (value < 1000) {
    return String(value)
  }
  if (value < 1_000_000) {
    return formatScaled(value / 1000, "k")
  }
  return formatScaled(value / 1_000_000, "M")
}

export const contextUsageRatio = (usage: ContextUsage): number =>
  Math.min(1, usage.used / usage.window)

export const contextUsageTone = (usage: ContextUsage): ContextUsageTone => {
  const ratio = contextUsageRatio(usage)
  if (ratio >= 0.95) {
    return "critical"
  }
  if (ratio >= 0.8) {
    return "warning"
  }
  return "default"
}

export const formatContextUsage = (usage: ContextUsage): string =>
  `${formatTokenCount(usage.used)} / ${formatTokenCount(usage.window)}`
