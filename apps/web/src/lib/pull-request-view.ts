import type {
  GitPullRequest,
  GitPullRequestComment,
  GitPullRequestReview,
  GitPullRequestReviewState,
} from "@noyau/contracts/git"

export type PullRequestTabFields = {
  readonly number: number | null
  readonly url: string | null
}

export type PullRequestTimelineItem =
  | { readonly kind: "opened"; readonly at: string }
  | {
      readonly kind: "commit"
      readonly at: string
      readonly commit: GitPullRequest["commits"][number]
    }
  | { readonly kind: "review"; readonly at: string | null; readonly review: GitPullRequestReview }
  | { readonly kind: "comment"; readonly at: string; readonly comment: GitPullRequestComment }

const atMs = (value: string | null): number => {
  if (value === null) {
    return Number.POSITIVE_INFINITY
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

export const pullRequestTimeline = (
  pr: Pick<GitPullRequest, "createdAt" | "commits" | "reviews" | "comments">,
): ReadonlyArray<PullRequestTimelineItem> => {
  const items: Array<PullRequestTimelineItem> = [
    { kind: "opened", at: pr.createdAt },
    ...pr.commits.map((commit) => ({ kind: "commit" as const, at: commit.committedAt, commit })),
    ...pr.comments.map((comment) => ({ kind: "comment" as const, at: comment.createdAt, comment })),
    ...pr.reviews.map((review) => ({ kind: "review" as const, at: review.submittedAt, review })),
  ]
  return items.toSorted((left, right) => atMs(left.at) - atMs(right.at))
}

export const pullRequestReviewStateLabel = (state: GitPullRequestReviewState): string => {
  switch (state) {
    case "approved":
      return "Approved"
    case "changes_requested":
      return "Requested changes"
    case "dismissed":
      return "Dismissed"
    case "pending":
      return "Pending"
    case "commented":
      return "Commented"
  }
}

export const pullRequestTabTitle = (payload: PullRequestTabFields): string =>
  payload.number === null || payload.number <= 0 ? "Pull request" : `#${payload.number}`

export const resolvedPullRequestNumber = (
  payload: PullRequestTabFields,
  live: { readonly number: number } | null,
): number | null =>
  payload.number === null || payload.number <= 0 ? (live?.number ?? null) : payload.number

export const resolvedPullRequestUrl = (
  payload: PullRequestTabFields,
  live: { readonly url: string } | null,
): string | null => (payload.url === null || payload.url === "" ? (live?.url ?? null) : payload.url)

export const pullRequestRepositoryLabel = (url: string): string => {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean)
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : "GitHub"
  } catch {
    return "GitHub"
  }
}

export type PullRequestLinePosition = {
  readonly line: number
  readonly side: "left" | "right"
}

export const pullRequestLinePosition = (range: {
  readonly start: number
  readonly end: number
  readonly side?: "deletions" | "additions"
  readonly endSide?: "deletions" | "additions"
}): PullRequestLinePosition => ({
  line: range.end,
  side: (range.endSide ?? range.side) === "deletions" ? "left" : "right",
})

export const canSubmitPullRequestReview = (
  verdict: "comment" | "approve" | "request_changes",
  body: string,
  commentCount: number,
): boolean => verdict === "approve" || body.trim() !== "" || commentCount > 0
