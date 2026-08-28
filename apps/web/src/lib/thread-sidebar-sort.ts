import type { ThreadShell } from "@noyau/contracts/shell"
import { DateTime } from "effect"

import type { ThreadPins } from "@/lib/thread-pins"
import { effectiveSettled, type ChangeRequestStateLike } from "@/lib/thread-settled"

const compareByCreatedAtDesc = <
  T extends { readonly id: string; readonly createdAt: DateTime.Utc },
>(
  left: T,
  right: T,
): number => {
  const byCreated = DateTime.toEpochMillis(right.createdAt) - DateTime.toEpochMillis(left.createdAt)
  return byCreated !== 0 ? byCreated : left.id.localeCompare(right.id)
}

/** Pinned first (most recently pinned first), then creation order newest first. */
export const sortThreadsForSidebar = <
  T extends { readonly id: string; readonly createdAt: DateTime.Utc },
>(
  threads: ReadonlyArray<T>,
  pins: ThreadPins = new Map(),
): ReadonlyArray<T> =>
  threads.toSorted((left, right) => {
    const leftPinnedAt = pins.get(left.id)
    const rightPinnedAt = pins.get(right.id)
    const leftPinned = leftPinnedAt !== undefined
    const rightPinned = rightPinnedAt !== undefined
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1
    }
    if (leftPinned && rightPinned) {
      const byPinned = rightPinnedAt - leftPinnedAt
      return byPinned !== 0 ? byPinned : left.id.localeCompare(right.id)
    }
    return compareByCreatedAtDesc(left, right)
  })

export interface SidebarThreadPartition<T extends ThreadShell> {
  readonly active: ReadonlyArray<T>
  readonly settled: ReadonlyArray<T>
}

export const partitionThreadsForSidebar = <T extends ThreadShell>(
  threads: ReadonlyArray<T>,
  options: {
    readonly pins: ThreadPins
    readonly nowMs: number
    readonly autoSettleAfterDays: number | null
    readonly autoSettleOnMerge: boolean
    readonly changeRequestStateOf: (thread: T) => ChangeRequestStateLike | null
  },
): SidebarThreadPartition<T> => {
  const active: T[] = []
  const settled: T[] = []
  for (const thread of threads) {
    if (options.pins.has(thread.id)) {
      active.push(thread)
      continue
    }
    if (
      effectiveSettled(thread, {
        nowMs: options.nowMs,
        autoSettleAfterDays: options.autoSettleAfterDays,
        autoSettleOnMerge: options.autoSettleOnMerge,
        changeRequestState: options.changeRequestStateOf(thread),
      })
    ) {
      settled.push(thread)
      continue
    }
    active.push(thread)
  }
  return {
    active: sortThreadsForSidebar(active, options.pins),
    settled: sortThreadsForSidebar(settled),
  }
}
