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
  pr: Pick<GitPullRequest, "reviews" | "comments">,
): ReadonlyArray<PullRequestTimelineItem> => {
  const items: Array<PullRequestTimelineItem> = [
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
