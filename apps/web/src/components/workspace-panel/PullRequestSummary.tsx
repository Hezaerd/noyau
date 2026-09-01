import type { GitPullRequest } from "@noyau/contracts/git"
import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  Clock3Icon,
  MessageSquareIcon,
  UsersIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { ThreadPreviewMarkdown } from "@/components/thread/ThreadPreviewMarkdown"
import { Badge } from "@/components/ui/badge"
import { pullRequestStateLabel } from "@/lib/vcs-status"

const ciPresentation = (status: GitPullRequest["ciStatus"]) => {
  switch (status) {
    case "passing":
      return { label: "Checks passing", icon: CircleCheckIcon, className: "text-success" }
    case "failing":
      return { label: "Checks failing", icon: CircleXIcon, className: "text-destructive" }
    case "pending":
      return { label: "Checks pending", icon: Clock3Icon, className: "text-warning" }
    case "none":
      return { label: "No checks", icon: CircleDotIcon, className: "text-muted-foreground" }
  }
}

export function PullRequestSummary({ pr }: { readonly pr: GitPullRequest }) {
  const reviewers = Array.from(
    new Set(pr.reviews.flatMap((review) => (review.author === null ? [] : [review.author.login]))),
  )
  const checks = ciPresentation(pr.ciStatus)
  const ChecksIcon = checks.icon

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col" data-slot="workspace-pr-summary">
      <section className="grid gap-3 border-b border-border/70 px-4 py-4 sm:grid-cols-3">
        <SummaryFact icon={UsersIcon} label="Reviewers">
          {reviewers.length === 0 ? "None" : reviewers.join(", ")}
        </SummaryFact>
        <SummaryFact icon={MessageSquareIcon} label="Comments">
          {pr.comments.length + pr.reviews.length}
        </SummaryFact>
        <SummaryFact icon={ChecksIcon} label="Status" valueClassName={checks.className}>
          {checks.label}
        </SummaryFact>
      </section>

      <section className="border-b border-border/70 px-4 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Description</h2>
          <Badge
            size="sm"
            variant={pr.state === "open" ? "success" : pr.state === "merged" ? "info" : "outline"}
          >
            {pullRequestStateLabel(pr.state)}
          </Badge>
        </div>
        {pr.body.trim() === "" ? (
          <p className="text-muted-foreground text-sm">No description.</p>
        ) : (
          <ThreadPreviewMarkdown text={pr.body} />
        )}
      </section>

      <section className="px-4 py-5">
        <h2 className="mb-3 text-sm font-semibold">Checks</h2>
        {pr.failedChecks.length === 0 ? (
          <div className={`flex items-center gap-2 text-sm ${checks.className}`}>
            <ChecksIcon className="size-4" />
            {checks.label}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {pr.failedChecks.map((check) => (
              <li key={check.name} className="flex items-center gap-2 text-sm">
                <CircleXIcon className="size-4 shrink-0 text-destructive" />
                {check.url === undefined ? (
                  <span>{check.name}</span>
                ) : (
                  <a
                    className="underline-offset-4 hover:underline"
                    href={check.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {check.name}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SummaryFact({
  icon: Icon,
  label,
  valueClassName,
  children,
}: {
  readonly icon: typeof UsersIcon
  readonly label: string
  readonly valueClassName?: string
  readonly children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-sm">
      <Icon className="mt-0.5 size-4 text-muted-foreground" />
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`col-start-2 min-w-0 truncate ${valueClassName ?? ""}`}>{children}</span>
    </div>
  )
}
