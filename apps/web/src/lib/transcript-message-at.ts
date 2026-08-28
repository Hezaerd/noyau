import type { TranscriptItem } from "@noyau/contracts/entities/transcript"
import type { Turn } from "@noyau/contracts/entities/turn"
import { DateTime } from "effect"

const TIME_OPTIONS = {
  locale: "en",
  hour: "numeric",
  minute: "2-digit",
} as const satisfies Intl.DateTimeFormatOptions & { readonly locale: string }

const TOOLTIP_OPTIONS = {
  locale: "en",
  dateStyle: "long",
  timeStyle: "short",
} as const satisfies Intl.DateTimeFormatOptions & { readonly locale: string }

const sameYearDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "numeric",
})

const otherYearDateFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "numeric",
  year: "numeric",
})

const localDayStartMs = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

const calendarDayDiff = (messageMs: number, nowMs: number): number => {
  const startOfToday = localDayStartMs(new Date(nowMs))
  const startOfMessageDay = localDayStartMs(new Date(messageMs))
  return Math.round((startOfToday - startOfMessageDay) / 86_400_000)
}

export const formatTranscriptMessageAt = (at: DateTime.Utc, nowMs: number = Date.now()): string => {
  const time = DateTime.formatLocal(at, TIME_OPTIONS)
  const dayDiff = calendarDayDiff(DateTime.toEpochMillis(at), nowMs)
  if (dayDiff <= 0) {
    return time
  }
  if (dayDiff === 1) {
    return `yesterday at ${time}`
  }
  const date = new Date(DateTime.toEpochMillis(at))
  const dateLabel =
    date.getFullYear() === new Date(nowMs).getFullYear()
      ? sameYearDateFormatter.format(date)
      : otherYearDateFormatter.format(date)
  return `${dateLabel} ${time}`
}

export const formatTranscriptMessageAtTooltip = (at: DateTime.Utc): string =>
  DateTime.formatLocal(at, TOOLTIP_OPTIONS)

export const transcriptItemMessageAt = (
  item: TranscriptItem,
  turn: Pick<Turn, "requestedAt" | "completedAt"> | undefined,
  streaming = false,
): DateTime.Utc | undefined => {
  if (turn === undefined) {
    return undefined
  }
  if (item._tag === "transcript.user") {
    return turn.requestedAt
  }
  if (item._tag === "transcript.assistant") {
    if (streaming || turn.completedAt === null) {
      return undefined
    }
    return turn.completedAt
  }
  return undefined
}

export const transcriptItemCopyText = (
  item: TranscriptItem,
  streaming = false,
): string | undefined => {
  if (item._tag === "transcript.user") {
    return item.text
  }
  if (item._tag === "transcript.assistant") {
    return streaming || item.text.length === 0 ? undefined : item.text
  }
  return undefined
}
