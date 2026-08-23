import type { VcsScope, VcsStatusResult } from "@noyau/protocol/git"
import { useEffect, useState } from "react"

import { subscribeVcsStatus } from "@/lib/control-plane"
import { applyVcsStatusStreamEvent } from "@/lib/vcs-status"

export const useVcsStatus = (scope: VcsScope | null): VcsStatusResult | null => {
  const [status, setStatus] = useState<VcsStatusResult | null>(null)
  const projectId = scope?.projectId
  const threadId = scope?.threadId

  useEffect(() => {
    if (projectId === undefined) {
      setStatus(null)
      return
    }
    const nextScope: VcsScope = threadId === undefined ? { projectId } : { projectId, threadId }
    setStatus(null)
    return subscribeVcsStatus(nextScope, (event) => {
      setStatus((current) => applyVcsStatusStreamEvent(current, event))
    })
  }, [projectId, threadId])

  return status
}
