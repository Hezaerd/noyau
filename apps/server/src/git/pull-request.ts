import {
  type GitPullRequest,
  type GitPullRequestAuthor,
  type GitPullRequestComment,
  type GitPullRequestFile,
  type GitPullRequestReview,
  type GitPullRequestReviewState,
  type VcsStatusCiVerdict,
  type VcsStatusFailedCheck,
  type VcsStatusMergeability,
  type VcsStatusPullRequest,
  type VcsStatusPullRequestState,
} from "@noyau/contracts/git"
import { Effect, Schema } from "effect"

const MAX_FAILED_CHECKS = 8

const GhPullRequestState = Schema.Literals(["OPEN", "CLOSED", "MERGED", "open", "closed", "merged"])

const GhCheck = Schema.Struct({
  __typename: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.NullOr(Schema.String)),
  context: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.optionalKey(Schema.NullOr(Schema.String)),
  conclusion: Schema.optionalKey(Schema.NullOr(Schema.String)),
  state: Schema.optionalKey(Schema.NullOr(Schema.String)),
  detailsUrl: Schema.optionalKey(Schema.NullOr(Schema.String)),
  targetUrl: Schema.optionalKey(Schema.NullOr(Schema.String)),
})
export type GhCheck = (typeof GhCheck)["Type"]

const GhPullRequest = Schema.Struct({
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  title: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
  baseRefName: Schema.NonEmptyString,
  headRefName: Schema.NonEmptyString,
  state: GhPullRequestState,
  mergeable: Schema.optionalKey(Schema.NullOr(Schema.String)),
  updatedAt: Schema.optionalKey(Schema.String),
  statusCheckRollup: Schema.optionalKey(Schema.NullOr(Schema.Array(GhCheck))),
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

export const normalizeMergeability = (value: string | null | undefined): VcsStatusMergeability => {
  switch (value?.trim().toUpperCase()) {
    case "MERGEABLE":
      return "mergeable"
    case "CONFLICTING":
      return "conflicting"
    default:
      return "unknown"
  }
}

type CheckKind = "pending" | "failure" | "success" | "other"

const classifyCheck = (raw: GhCheck): CheckKind => {
  const status = raw.status?.trim().toUpperCase()
  if (status !== undefined && status !== "" && status !== "COMPLETED") {
    return "pending"
  }
  switch ((raw.conclusion ?? raw.state)?.trim().toUpperCase()) {
    case "FAILURE":
    case "ERROR":
    case "TIMED_OUT":
    case "STARTUP_FAILURE":
      return "failure"
    case "SUCCESS":
      return "success"
    case "PENDING":
    case "EXPECTED":
      return "pending"
    default:
      return "other"
  }
}

const checkName = (raw: GhCheck): string => (raw.name ?? raw.context ?? "").trim()

const checkUrl = (raw: GhCheck): string | undefined => {
  const url = (raw.detailsUrl ?? raw.targetUrl)?.trim()
  return url === undefined || url === "" ? undefined : url
}

export interface FoldedCiStatus {
  readonly ciStatus: VcsStatusCiVerdict
  readonly failedChecks: ReadonlyArray<VcsStatusFailedCheck>
}

export const foldCiStatus = (rollup: ReadonlyArray<GhCheck> | null | undefined): FoldedCiStatus => {
  const checks = rollup ?? []
  if (checks.length === 0) {
    return { ciStatus: "none", failedChecks: [] }
  }
  const failedChecks: Array<VcsStatusFailedCheck> = []
  const seenFailed = new Set<string>()
  let hasFailure = false
  let hasPending = false
  let hasSuccess = false
  for (const check of checks) {
    const kind = classifyCheck(check)
    if (kind === "failure") {
      hasFailure = true
      const name = checkName(check)
      if (name !== "" && !seenFailed.has(name) && failedChecks.length < MAX_FAILED_CHECKS) {
        seenFailed.add(name)
        const url = checkUrl(check)
        failedChecks.push(url === undefined ? { name } : { name, url })
      }
    } else if (kind === "pending") {
      hasPending = true
    } else if (kind === "success") {
      hasSuccess = true
    }
  }
  if (hasFailure) {
    return { ciStatus: "failing", failedChecks }
  }
  if (hasPending) {
    return { ciStatus: "pending", failedChecks: [] }
  }
  if (hasSuccess) {
    return { ciStatus: "passing", failedChecks: [] }
  }
  return { ciStatus: "none", failedChecks: [] }
}

export const toListedPullRequest = (item: {
  readonly number: number
  readonly title: string
  readonly url: string
  readonly baseRefName: string
  readonly headRefName: string
  readonly state: string
  readonly mergeable?: string | null
  readonly updatedAt?: string
  readonly statusCheckRollup?: ReadonlyArray<GhCheck> | null
}): ListedPullRequest => {
  const ci = foldCiStatus(item.statusCheckRollup)
  return {
    number: item.number,
    title: item.title,
    url: item.url,
    baseRef: item.baseRefName,
    headRef: item.headRefName,
    state: normalizePullRequestState(item.state),
    mergeability: normalizeMergeability(item.mergeable),
    ciStatus: ci.ciStatus,
    failedChecks: ci.failedChecks,
    updatedAt: item.updatedAt ?? null,
  }
}

export const toStatusPullRequest = (item: ListedPullRequest): VcsStatusPullRequest => ({
  number: item.number,
  title: item.title,
  url: item.url,
  baseRef: item.baseRef,
  headRef: item.headRef,
  state: item.state,
  mergeability: item.mergeability,
  ciStatus: item.ciStatus,
  failedChecks: item.failedChecks,
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

const isTerminalPrState = (state: VcsStatusPullRequestState): boolean =>
  state === "merged" || state === "closed"

/** Une liste vide ne doit pas effacer une PR terminale déjà vue sur cette branche. */
export const rememberStatusPullRequest = (
  previous: VcsStatusPullRequest | null | undefined,
  selected: VcsStatusPullRequest | null,
): VcsStatusPullRequest | null => {
  if (selected !== null) {
    return selected
  }
  if (previous != null && isTerminalPrState(previous.state)) {
    return previous
  }
  return null
}

export const decodeListedPullRequests = (stdout: string) =>
  decodeGhPullRequestListJson(stdout.trim() === "" ? "[]" : stdout).pipe(
    Effect.map((items) => items.map(toListedPullRequest)),
  )

export const PR_VIEW_JSON_FIELDS =
  "number,title,url,body,author,state,baseRefName,headRefName,reviews,comments,files"

const GhAuthor = Schema.Struct({
  login: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

const GhReview = Schema.Struct({
  author: Schema.optionalKey(Schema.NullOr(GhAuthor)),
  body: Schema.optionalKey(Schema.NullOr(Schema.String)),
  state: Schema.optionalKey(Schema.NullOr(Schema.String)),
  submittedAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

const GhComment = Schema.Struct({
  author: Schema.optionalKey(Schema.NullOr(GhAuthor)),
  body: Schema.optionalKey(Schema.NullOr(Schema.String)),
  createdAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

const GhFile = Schema.Struct({
  path: Schema.NonEmptyString,
  additions: Schema.optionalKey(Schema.NullOr(Schema.Int)),
  deletions: Schema.optionalKey(Schema.NullOr(Schema.Int)),
})

const GhPullRequestView = Schema.Struct({
  number: Schema.Int.check(Schema.isGreaterThan(0)),
  title: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
  body: Schema.optionalKey(Schema.NullOr(Schema.String)),
  author: Schema.optionalKey(Schema.NullOr(GhAuthor)),
  state: GhPullRequestState,
  baseRefName: Schema.NonEmptyString,
  headRefName: Schema.NonEmptyString,
  reviews: Schema.optionalKey(Schema.NullOr(Schema.Array(GhReview))),
  comments: Schema.optionalKey(Schema.NullOr(Schema.Array(GhComment))),
  files: Schema.optionalKey(Schema.NullOr(Schema.Array(GhFile))),
})

const decodeGhPullRequestViewJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(GhPullRequestView),
)

const toAuthor = (raw: typeof GhAuthor.Type | null | undefined): GitPullRequestAuthor | null => {
  const login = raw?.login?.trim()
  return login === undefined || login === "" ? null : { login }
}

export const normalizeReviewState = (
  state: string | null | undefined,
): GitPullRequestReviewState => {
  switch (state?.trim().toUpperCase()) {
    case "APPROVED":
      return "approved"
    case "CHANGES_REQUESTED":
      return "changes_requested"
    case "DISMISSED":
      return "dismissed"
    case "PENDING":
      return "pending"
    default:
      return "commented"
  }
}

export const toGitPullRequestReview = (item: typeof GhReview.Type): GitPullRequestReview => {
  const submittedAt = item.submittedAt?.trim()
  return {
    author: toAuthor(item.author),
    state: normalizeReviewState(item.state),
    body: item.body ?? "",
    submittedAt: submittedAt === undefined || submittedAt === "" ? null : submittedAt,
  }
}

export const toGitPullRequestComment = (
  item: typeof GhComment.Type,
): GitPullRequestComment | null => {
  const createdAt = item.createdAt?.trim()
  if (createdAt === undefined || createdAt === "") {
    return null
  }
  return {
    author: toAuthor(item.author),
    body: item.body ?? "",
    createdAt,
  }
}

export const toGitPullRequestFile = (item: typeof GhFile.Type): GitPullRequestFile => ({
  path: item.path,
  additions: item.additions ?? 0,
  deletions: item.deletions ?? 0,
})

export const toGitPullRequest = (
  item: typeof GhPullRequestView.Type,
  patch: string,
): GitPullRequest => ({
  number: item.number,
  title: item.title,
  url: item.url,
  body: item.body ?? "",
  author: toAuthor(item.author),
  state: normalizePullRequestState(item.state),
  baseRef: item.baseRefName,
  headRef: item.headRefName,
  reviews: (item.reviews ?? []).map(toGitPullRequestReview),
  comments: (item.comments ?? []).flatMap((comment) => {
    const mapped = toGitPullRequestComment(comment)
    return mapped === null ? [] : [mapped]
  }),
  files: (item.files ?? []).map(toGitPullRequestFile),
  patch,
})

export const decodeViewedPullRequest = (stdout: string, patch: string) =>
  decodeGhPullRequestViewJson(stdout).pipe(Effect.map((item) => toGitPullRequest(item, patch)))
