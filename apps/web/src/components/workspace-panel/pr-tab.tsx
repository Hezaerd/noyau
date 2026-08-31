import { GitPullRequestIcon } from "lucide-react"

import { defineWorkspaceTab } from "@/components/workspace-panel/define-workspace-tab"
import {
  PullRequestView,
  type PullRequestTabPayload,
} from "@/components/workspace-panel/PullRequestView"
import { pullRequestTabTitle } from "@/lib/pull-request-view"
import type { PullRequestTabInput } from "@/lib/workspace-pr"

/** Un onglet PR par Thread. identity fixe : le badge et le lanceur se réutilisent. */
export const pullRequestWorkspaceTab = defineWorkspaceTab<
  "pr",
  PullRequestTabPayload,
  PullRequestTabInput | undefined
>({
  kind: "pr",
  label: "Pull request",
  keepMounted: true,
  create: (_tabId, input) => ({
    number: input?.number ?? null,
    url: input?.url ?? null,
  }),
  identityOf: () => "pr",
  icon: GitPullRequestIcon,
  titleOf: (tab) => pullRequestTabTitle(tab.payload),
  render: (context) => <PullRequestView {...context} />,
})
