import type { GitPullRequest } from "@noyau/contracts/git"
import {
  ArrowDownUpIcon,
  CheckCircle2Icon,
  CircleXIcon,
  GitCommitHorizontalIcon,
  GitPullRequestIcon,
  MessageSquareIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import { ThreadPreviewMarkdown } from "@/components/thread/ThreadPreviewMarkdown"
import { Button } from "@/components/ui/button"
import {
  pullRequestReviewStateLabel,
  pullRequestTimeline,
  type PullRequestTimelineItem,
} from "@/lib/pull-request-view"

const formatActivityTime = (value: string | null): string => {
  if (value === null) {
    return "Pending"
  }
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
}

export function PullRequestTimeline({ pr }: { readonly pr: GitPullRequest }) {
  const [order, setOrder] = useState<"newest" | "oldest">("newest")
  const items = useMemo(() => {
    const timeline = pullRequestTimeline(pr)
    return order === "newest" ? timeline.toReversed() : timeline
  }, [order, pr])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4" data-slot="workspace-pr-timeline">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          {items.length} {items.length === 1 ? "event" : "events"}
        </p>
        <Button
          size="xs"
          type="button"
          variant="ghost"
          onClick={() => setOrder((value) => (value === "newest" ? "oldest" : "newest"))}
        >
          <ArrowDownUpIcon />
          {order === "newest" ? "Newest first" : "Oldest first"}
        </Button>
      </div>
      <ol className="relative ml-2 border-border border-l">
        {items.map((item, index) => (
          <TimelineItem key={timelineKey(item, index)} item={item} />
        ))}
      </ol>
    </div>
  )
}

function timelineKey(item: PullRequestTimelineItem, index: number): string {
  switch (item.kind) {
    case "opened":
      return `opened:${item.at}`
    case "commit":
      return `commit:${item.commit.oid}`
    case "review":
      return `review:${item.at ?? "pending"}:${item.review.author?.login ?? "unknown"}:${index}`
    case "comment":
      return `comment:${item.at}:${item.comment.author?.login ?? "unknown"}:${index}`
  }
}

function TimelineItem({ item }: { readonly item: PullRequestTimelineItem }) {
  const presentation = timelinePresentation(item)
  const Icon = presentation.icon
  return (
    <li className="relative pb-6 pl-8 last:pb-0">
      <span className="absolute -left-3 top-0 flex size-6 items-center justify-center rounded-full border border-border bg-background">
        <Icon className={`size-3.5 ${presentation.iconClassName}`} />
      </span>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="min-w-0 text-sm font-medium">{presentation.title}</p>
        <time className="text-muted-foreground text-xs" dateTime={item.at ?? undefined}>
          {formatActivityTime(item.at)}
        </time>
      </div>
      {presentation.detail === null ? null : (
        <p className="mt-0.5 text-muted-foreground text-xs">{presentation.detail}</p>
      )}
      {presentation.body.trim() === "" ? null : (
        <ThreadPreviewMarkdown className="mt-2" text={presentation.body} />
      )}
    </li>
  )
}

type TimelinePresentation = {
  readonly title: string
  readonly detail: string | null
  readonly body: string
  readonly icon: typeof GitPullRequestIcon
  readonly iconClassName: string
}

function timelinePresentation(item: PullRequestTimelineItem): TimelinePresentation {
  switch (item.kind) {
    case "opened":
      return {
        title: "Pull request opened",
        detail: null,
        body: "",
        icon: GitPullRequestIcon,
        iconClassName: "text-muted-foreground",
      } satisfies TimelinePresentation
    case "commit":
      return {
        title: item.commit.messageHeadline || "Commit",
        detail: item.commit.oid.slice(0, 7),
        body: "",
        icon: GitCommitHorizontalIcon,
        iconClassName: "text-muted-foreground",
      } satisfies TimelinePresentation
    case "comment":
      return {
        title: `${item.comment.author?.login ?? "Unknown"} commented`,
        detail: null,
        body: item.comment.body,
        icon: MessageSquareIcon,
        iconClassName: "text-muted-foreground",
      } satisfies TimelinePresentation
    case "review": {
      const approved = item.review.state === "approved"
      return {
        title: `${item.review.author?.login ?? "Unknown"} ${pullRequestReviewStateLabel(item.review.state).toLowerCase()}`,
        detail: null,
        body: item.review.body,
        icon: approved
          ? CheckCircle2Icon
          : item.review.state === "changes_requested"
            ? CircleXIcon
            : MessageSquareIcon,
        iconClassName: approved
          ? "text-success"
          : item.review.state === "changes_requested"
            ? "text-destructive"
            : "text-muted-foreground",
      } satisfies TimelinePresentation
    }
  }
}
