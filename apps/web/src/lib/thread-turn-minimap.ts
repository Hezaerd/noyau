import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type { TurnId } from "@noyau/protocol/ids"

import { transcriptRowId } from "@/lib/thread-transcript"

export const TURN_MINIMAP_MIN_ITEMS = 2
export const TURN_MINIMAP_ITEM_SPACING = 8
export const TURN_MINIMAP_MAX_HEIGHT_CSS = "calc(100vh - 18rem)"
/** Matches `max-w-4xl` on the transcript column. */
export const TURN_MINIMAP_CONTENT_MAX_WIDTH = 896
export const TURN_MINIMAP_PERSISTENT_GUTTER = 48
export const TURN_MINIMAP_HIT_STRIP_LEFT = 12
export const TURN_MINIMAP_HIT_STRIP_MAX_WIDTH = 40
export const TURN_MINIMAP_EXPANDED_HIT_STRIP_WIDTH = "22rem"

export interface TurnMinimapItem {
  readonly turnId: TurnId
  readonly messageId: string
  readonly userText: string | null
  readonly assistantText: string | null
}

export const compactTurnMinimapPreview = (text: string | null | undefined): string | null => {
  const compact = text?.replace(/\s+/g, " ").trim() ?? ""
  return compact.length > 0 ? compact : null
}

export const deriveTurnMinimapItems = (
  transcript: ReadonlyArray<TranscriptItem>,
): ReadonlyArray<TurnMinimapItem> => {
  const items: TurnMinimapItem[] = []
  let current: TurnMinimapItem | undefined

  for (const item of transcript) {
    if (item._tag === "transcript.user") {
      current = {
        turnId: item.turnId,
        messageId: transcriptRowId(item, 0),
        userText: compactTurnMinimapPreview(item.text),
        assistantText: null,
      }
      items.push(current)
      continue
    }

    if (item._tag !== "transcript.assistant" || current === undefined) {
      continue
    }
    if (current.turnId !== item.turnId) {
      continue
    }

    const assistantText = compactTurnMinimapPreview(item.text)
    if (assistantText === null) {
      continue
    }
    current = { ...current, assistantText }
    items[items.length - 1] = current
  }

  return items
}

export const resolveTurnMinimapHeightStyle = (itemCount: number): string => {
  const naturalHeight = Math.max(1, (itemCount - 1) * TURN_MINIMAP_ITEM_SPACING)
  return `min(${String(naturalHeight)}px, ${TURN_MINIMAP_MAX_HEIGHT_CSS})`
}

export const resolveTurnMinimapTopPercent = (index: number, itemCount: number): number => {
  if (itemCount <= 1) {
    return 0
  }
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100
}

export const resolveTurnMinimapIndexFromPointer = (input: {
  readonly itemCount: number
  readonly railTop: number
  readonly railHeight: number
  readonly pointerY: number
}): number | null => {
  if (input.itemCount <= 0 || input.railHeight <= 0) {
    return null
  }
  if (input.itemCount === 1) {
    return 0
  }

  const progress = Math.max(0, Math.min(1, (input.pointerY - input.railTop) / input.railHeight))
  return Math.max(0, Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))))
}

const sideGutter = (viewportWidth: number): number => {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return 0
  }
  const contentWidth = Math.min(viewportWidth, TURN_MINIMAP_CONTENT_MAX_WIDTH)
  return Math.max(0, (viewportWidth - contentWidth) / 2)
}

export const resolveTurnMinimapHasPersistentGutter = (viewportWidth: number): boolean =>
  sideGutter(viewportWidth) >= TURN_MINIMAP_PERSISTENT_GUTTER

export const resolveTurnMinimapHitStripWidth = (viewportWidth: number): number =>
  Math.max(
    0,
    Math.min(
      TURN_MINIMAP_HIT_STRIP_MAX_WIDTH,
      Math.floor(sideGutter(viewportWidth)) - TURN_MINIMAP_HIT_STRIP_LEFT,
    ),
  )

export const resolveTurnMinimapInteractiveWidth = (
  collapsedWidth: number,
  expanded: boolean,
): number | string => (expanded ? TURN_MINIMAP_EXPANDED_HIT_STRIP_WIDTH : collapsedWidth)

export const turnMinimapItemIsInView = (
  item: Pick<TurnMinimapItem, "messageId" | "turnId">,
  visibleMessageIds: Iterable<string>,
): boolean => {
  for (const id of visibleMessageIds) {
    if (id === item.messageId || id.includes(item.turnId)) {
      return true
    }
  }
  return false
}
