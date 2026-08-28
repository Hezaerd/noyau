import type { VcsStatusPullRequest } from "@noyau/contracts/git"
import { GitPullRequestIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { pullRequestStateLabel } from "@/lib/vcs-status"

const variantForState = (state: VcsStatusPullRequest["state"]) => {
  if (state === "open") {
    return "success" as const
  }
  if (state === "merged") {
    return "info" as const
  }
  return "outline" as const
}

export function ThreadPullRequestBadge({
  pr,
  compact = false,
}: {
  readonly pr: VcsStatusPullRequest
  readonly compact?: boolean
}) {
  const label = `#${pr.number}`
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            size="sm"
            variant={variantForState(pr.state)}
            render={
              <a
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              />
            }
            className={cn("no-drag max-w-32", compact && "px-1")}
            aria-label={`PR ${label} · ${pullRequestStateLabel(pr.state)}`}
          />
        }
      >
        <GitPullRequestIcon />
        <span className="truncate">{label}</span>
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {pullRequestStateLabel(pr.state)} · {pr.title}
      </TooltipPopup>
    </Tooltip>
  )
}
