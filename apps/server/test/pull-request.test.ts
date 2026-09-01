import { describe, expect, it } from "@effect/vitest"
import {
  buildPullRequestReviewJson,
  decodeListedPullRequests,
  decodeViewedPullRequest,
  foldCiStatus,
  normalizeMergeability,
  normalizePullRequestState,
  normalizeReviewState,
  rememberStatusPullRequest,
  selectStatusPullRequest,
  toListedPullRequest,
} from "@noyau/server/git/pull-request"
import { Effect, Exit, Schema } from "effect"

const UnknownJson = Schema.fromJsonString(Schema.Unknown)

const item = (
  overrides: Partial<Parameters<typeof toListedPullRequest>[0]> & { readonly number: number },
) => {
  const listed = {
    number: overrides.number,
    title: overrides.title ?? `PR ${overrides.number}`,
    url: overrides.url ?? `https://github.com/hezaerd/noyau/pull/${overrides.number}`,
    baseRefName: overrides.baseRefName ?? "main",
    headRefName: overrides.headRefName ?? "feat",
    state: overrides.state ?? "OPEN",
  }
  if (overrides.updatedAt === undefined) {
    return toListedPullRequest(listed)
  }
  return toListedPullRequest({ ...listed, updatedAt: overrides.updatedAt })
}

describe("pull-request helpers", () => {
  it("normalise les états gh", () => {
    expect(normalizePullRequestState("OPEN")).toBe("open")
    expect(normalizePullRequestState("MERGED")).toBe("merged")
    expect(normalizePullRequestState("closed")).toBe("closed")
  })

  it("plie statusCheckRollup : fail outrank pending, skip n’est pas un fail", () => {
    expect(foldCiStatus(undefined)).toEqual({ ciStatus: "none", failedChecks: [] })
    expect(foldCiStatus([])).toEqual({ ciStatus: "none", failedChecks: [] })
    expect(
      foldCiStatus([
        { name: "Verify", status: "IN_PROGRESS", conclusion: "" },
        { name: "Lint", status: "COMPLETED", conclusion: "SUCCESS" },
      ]),
    ).toEqual({ ciStatus: "pending", failedChecks: [] })
    expect(
      foldCiStatus([
        { name: "Verify", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://ex/1" },
        { name: "Lint", status: "IN_PROGRESS", conclusion: "" },
      ]),
    ).toEqual({
      ciStatus: "failing",
      failedChecks: [{ name: "Verify", url: "https://ex/1" }],
    })
    expect(
      foldCiStatus([
        { name: "PR Size", status: "COMPLETED", conclusion: "SKIPPED" },
        { name: "Lint", status: "COMPLETED", conclusion: "SUCCESS" },
      ]),
    ).toEqual({ ciStatus: "passing", failedChecks: [] })
    expect(
      foldCiStatus([
        { name: "Deploy", status: "COMPLETED", conclusion: "CANCELLED" },
        { name: "Review", status: "COMPLETED", conclusion: "ACTION_REQUIRED" },
      ]),
    ).toEqual({ ciStatus: "none", failedChecks: [] })
    expect(
      foldCiStatus([
        { context: "legacy-ci", state: "ERROR" },
        { context: "legacy-ci", state: "ERROR" },
      ]),
    ).toEqual({ ciStatus: "failing", failedChecks: [{ name: "legacy-ci" }] })
  })

  it("normalise mergeable et traite UNKNOWN comme unknown", () => {
    expect(normalizeMergeability("CONFLICTING")).toBe("conflicting")
    expect(normalizeMergeability("MERGEABLE")).toBe("mergeable")
    expect(normalizeMergeability("UNKNOWN")).toBe("unknown")
    expect(normalizeMergeability(null)).toBe("unknown")
    expect(normalizeMergeability("SOMETHING_NEW")).toBe("unknown")
  })

  it("préfère une PR ouverte et cache les merged/closed sur la default branch", () => {
    const open = item({ number: 2, state: "OPEN", updatedAt: "2026-01-01T00:00:00.000Z" })
    const merged = item({ number: 1, state: "MERGED", updatedAt: "2026-08-01T00:00:00.000Z" })
    expect(selectStatusPullRequest([merged, open], { isDefaultRef: false })?.number).toBe(2)
    expect(selectStatusPullRequest([merged], { isDefaultRef: true })).toBeNull()
    expect(selectStatusPullRequest([merged], { isDefaultRef: false })?.number).toBe(1)
  })

  it("ne remplace pas une PR terminale par une liste vide", () => {
    const merged = item({ number: 12, state: "MERGED" })
    const open = item({ number: 13, state: "OPEN" })
    expect(rememberStatusPullRequest(merged, null)?.number).toBe(12)
    expect(rememberStatusPullRequest(open, null)).toBeNull()
    expect(rememberStatusPullRequest(merged, open)?.number).toBe(13)
    expect(rememberStatusPullRequest(undefined, null)).toBeNull()
  })

  it.effect("décode une liste gh ou un stdout vide", () =>
    Effect.gen(function* () {
      const empty = yield* decodeListedPullRequests("  \n")
      expect(empty).toEqual([])
      const listed = yield* decodeListedPullRequests(
        '[{"number":7,"title":"Live PR","url":"https://github.com/hezaerd/noyau/pull/7","baseRefName":"main","headRefName":"feat/live","state":"OPEN","mergeable":"CONFLICTING","updatedAt":"2026-08-23T12:00:00Z","statusCheckRollup":[{"name":"Verify","status":"COMPLETED","conclusion":"FAILURE","detailsUrl":"https://github.com/hezaerd/noyau/actions/1"}]}]',
      )
      expect(listed[0]?.number).toBe(7)
      expect(listed[0]?.state).toBe("open")
      expect(listed[0]?.mergeability).toBe("conflicting")
      expect(listed[0]?.ciStatus).toBe("failing")
      expect(listed[0]?.failedChecks).toEqual([
        { name: "Verify", url: "https://github.com/hezaerd/noyau/actions/1" },
      ])
      const invalid = yield* Effect.exit(decodeListedPullRequests("{"))
      expect(Exit.isFailure(invalid)).toBe(true)
    }),
  )

  it("normalise les verdicts de review gh", () => {
    expect(normalizeReviewState("APPROVED")).toBe("approved")
    expect(normalizeReviewState("CHANGES_REQUESTED")).toBe("changes_requested")
    expect(normalizeReviewState("DISMISSED")).toBe("dismissed")
    expect(normalizeReviewState("PENDING")).toBe("pending")
    expect(normalizeReviewState("COMMENTED")).toBe("commented")
    expect(normalizeReviewState(null)).toBe("commented")
  })

  it.effect("décode une vue gh avec reviews, commentaires, fichiers et patch", () =>
    Effect.gen(function* () {
      const viewedJson = yield* Schema.encodeEffect(UnknownJson)({
        number: 42,
        title: "Add the PR viewer",
        url: "https://github.com/hezaerd/noyau/pull/42",
        body: "Description here.",
        author: { login: "hezaerd" },
        state: "OPEN",
        baseRefName: "main",
        headRefName: "feat/pr-viewer",
        createdAt: "2026-08-31T09:00:00Z",
        updatedAt: "2026-08-31T12:00:00Z",
        additions: 12,
        deletions: 1,
        mergeable: "MERGEABLE",
        statusCheckRollup: [{ name: "Verify", status: "COMPLETED", conclusion: "SUCCESS" }],
        reviews: [
          {
            author: { login: "reviewer" },
            body: "Looks good.",
            state: "APPROVED",
            submittedAt: "2026-08-31T12:00:00Z",
          },
        ],
        comments: [
          {
            author: { login: "commenter" },
            body: "Please ship it.",
            createdAt: "2026-08-31T11:00:00Z",
          },
          { author: { login: "ghost" }, body: "dropped", createdAt: "" },
        ],
        commits: [
          {
            oid: "0123456789abcdef0123456789abcdef01234567",
            messageHeadline: "feat: add the viewer",
            committedDate: "2026-08-31T10:00:00Z",
          },
        ],
        files: [{ path: "apps/web/src/pr.tsx", additions: 12, deletions: 1 }],
      })
      const viewed = yield* decodeViewedPullRequest(
        viewedJson,
        "diff --git a/apps/web/src/pr.tsx b/apps/web/src/pr.tsx\n",
      )
      expect(viewed.number).toBe(42)
      expect(viewed.body).toBe("Description here.")
      expect(viewed.author).toEqual({ login: "hezaerd" })
      expect(viewed.mergeability).toBe("mergeable")
      expect(viewed.ciStatus).toBe("passing")
      expect(viewed.commits).toEqual([
        {
          oid: "0123456789abcdef0123456789abcdef01234567",
          messageHeadline: "feat: add the viewer",
          committedAt: "2026-08-31T10:00:00Z",
        },
      ])
      expect(viewed.reviews).toEqual([
        {
          author: { login: "reviewer" },
          state: "approved",
          body: "Looks good.",
          submittedAt: "2026-08-31T12:00:00Z",
        },
      ])
      expect(viewed.comments).toEqual([
        {
          author: { login: "commenter" },
          body: "Please ship it.",
          createdAt: "2026-08-31T11:00:00Z",
        },
      ])
      expect(viewed.files).toEqual([{ path: "apps/web/src/pr.tsx", additions: 12, deletions: 1 }])
      expect(viewed.patch).toContain("apps/web/src/pr.tsx")
      const invalid = yield* Effect.exit(decodeViewedPullRequest("{", ""))
      expect(Exit.isFailure(invalid)).toBe(true)
    }),
  )

  it("construit une review GitHub atomique avec ses commentaires de ligne", () => {
    expect(
      Schema.decodeSync(UnknownJson)(
        buildPullRequestReviewJson({
          verdict: "request_changes",
          body: "Please address these notes.",
          comments: [
            {
              path: "apps/web/src/pr.tsx",
              line: 26,
              side: "right",
              body: "Handle the empty state here.",
            },
          ],
        }),
      ),
    ).toEqual({
      event: "REQUEST_CHANGES",
      body: "Please address these notes.",
      comments: [
        {
          path: "apps/web/src/pr.tsx",
          line: 26,
          side: "RIGHT",
          body: "Handle the empty state here.",
        },
      ],
    })
  })
})
