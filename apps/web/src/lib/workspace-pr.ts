import type { ThreadId } from "@noyau/contracts/ids"

import { pullRequestWorkspaceTab } from "@/components/workspace-panel/pr-tab"
import { openWorkspaceTabWith, patchWorkspaceTabPayload } from "@/state/workspace-panel"

export type PullRequestTabInput = {
  readonly number: number
  readonly url: string
}

/** Ouvre l’onglet PR du Thread. Un seul par Thread ; un input renseigne number/url. */
export const openWorkspacePullRequest = (threadId: ThreadId, pr?: PullRequestTabInput): string => {
  const tabId = openWorkspaceTabWith(threadId, pullRequestWorkspaceTab, pr)
  if (pr !== undefined) {
    patchWorkspaceTabPayload(threadId, tabId, { number: pr.number, url: pr.url })
  }
  return tabId
}
