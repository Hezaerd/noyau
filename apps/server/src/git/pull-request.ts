import { type VcsStatusPullRequest, type VcsStatusPullRequestState } from "@noyau/protocol/git"
import { Effect, Schema } from "effect"

const GhPullRequestState = Schema.Literals(["OPEN", "CLOSED", "MERGED", "open", "closed", "merged"])

const GhPullRequest = Schema.Struct({
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  title: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
  baseRefName: Schema.NonEmptyString,
  headRefName: Schema.NonEmptyString,
  state: GhPullRequestState,
  updatedAt: Schema.optionalKey(Schema.String),
})

const GhPullRequestList = Schema.Array(GhPullRequest)
const decodeGhPullRequestListJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(GhPullRequestList),
)

export interface ListedPullRequest extends VcsStatusPullRequest {
  readonly updatedAt: string | null
}

export const normalizePullRequestState = (state: string): VcsStatusPullRequestState => {
  const normalized = state.toLowerCase()
  if (normalized === "open" || normalized === "closed" || normalized === "merged") {
    return normalized
  }
  return "closed"
}

export const toListedPullRequest = (item: {
  readonly number: number
  readonly title: string
  readonly url: string
  readonly baseRefName: string
  readonly headRefName: string
  readonly state: string
  readonly updatedAt?: string
}): ListedPullRequest => ({
  number: item.number,
  title: item.title,
  url: item.url,
  baseRef: item.baseRefName,
  headRef: item.headRefName,
  state: normalizePullRequestState(item.state),
  updatedAt: item.updatedAt ?? null,
})

export const toStatusPullRequest = (item: ListedPullRequest): VcsStatusPullRequest => ({
  number: item.number,
  title: item.title,
  url: item.url,
  baseRef: item.baseRef,
  headRef: item.headRef,
  state: item.state,
})

const updatedAtMs = (value: string | null): number => {
  if (value === null) {
    return Number.NEGATIVE_INFINITY
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

export const selectStatusPullRequest = (
  items: ReadonlyArray<ListedPullRequest>,
  options: { readonly isDefaultRef: boolean },
): VcsStatusPullRequest | null => {
  const open = items.find((item) => item.state === "open")
  if (open !== undefined) {
    return toStatusPullRequest(open)
  }
  if (options.isDefaultRef) {
    return null
  }
  const latest = items.toSorted(
    (left, right) => updatedAtMs(right.updatedAt) - updatedAtMs(left.updatedAt),
  )[0]
  return latest === undefined ? null : toStatusPullRequest(latest)
}

export const decodeListedPullRequests = (stdout: string) =>
  decodeGhPullRequestListJson(stdout.trim() === "" ? "[]" : stdout).pipe(
    Effect.map((items) => items.map(toListedPullRequest)),
  )
