import type { VcsStatusPullRequest } from "@noyau/contracts/git"
import type { ThreadShell } from "@noyau/contracts/shell"
import { useEffect, useRef } from "react"

import { useAutoSettleOnMergeEnabled } from "@/hooks/use-thread-settle-preference"
import { dispatchThreadSettle } from "@/lib/thread-settle-actions"
import {
  canSettle,
  changeRequestSettleDecision,
  type ChangeRequestSettleSight,
} from "@/lib/thread-settled"

const sightOf = (pr: VcsStatusPullRequest | undefined): ChangeRequestSettleSight | null =>
  pr === undefined ? null : { number: pr.number, state: pr.state }

export const useAutoSettleMergedThreads = (
  threads: ReadonlyArray<ThreadShell>,
  pullRequests: ReadonlyMap<string, VcsStatusPullRequest>,
): void => {
  const autoSettleOnMerge = useAutoSettleOnMergeEnabled()
  const previousSights = useRef(new Map<string, ChangeRequestSettleSight | null>())

  useEffect(() => {
    const nextSights = new Map(previousSights.current)
    for (const thread of threads) {
      const previous = previousSights.current.get(thread.id) ?? null
      const next = sightOf(pullRequests.get(thread.id))
      const decision = changeRequestSettleDecision({
        previous,
        next,
        autoSettleOnMerge,
        canSettle: canSettle(thread),
        settledOverride: thread.settledOverride ?? null,
      })
      if (decision === "persist") {
        dispatchThreadSettle(thread, true, { initiatedByUser: false })
      }
      if (decision !== "retry") {
        nextSights.set(thread.id, next)
      }
    }
    previousSights.current = nextSights
  }, [autoSettleOnMerge, pullRequests, threads])
}
