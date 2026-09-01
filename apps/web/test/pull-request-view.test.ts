import { describe, expect, it } from "vite-plus/test"

import {
  canSubmitPullRequestReview,
  pullRequestLinePosition,
  pullRequestRepositoryLabel,
  pullRequestReviewStateLabel,
  pullRequestTabTitle,
  pullRequestTimeline,
  resolvedPullRequestNumber,
  resolvedPullRequestUrl,
} from "../src/lib/pull-request-view"

describe("pull request view helpers", () => {
  it("titles an unsaved tab as Pull request and a numbered tab as #N", () => {
    expect(pullRequestTabTitle({ number: null, url: null })).toBe("Pull request")
    expect(pullRequestTabTitle({ number: 12, url: "https://example.com/12" })).toBe("#12")
  })

  it("prefers the tab payload number over the live PR", () => {
    expect(resolvedPullRequestNumber({ number: 3, url: null }, { number: 9 })).toBe(3)
    expect(resolvedPullRequestNumber({ number: null, url: null }, { number: 9 })).toBe(9)
    expect(resolvedPullRequestNumber({ number: null, url: null }, null)).toBeNull()
  })

  it("keeps a payload URL and falls back to the live PR", () => {
    expect(
      resolvedPullRequestUrl(
        { number: null, url: "https://example.com/1" },
        { url: "https://example.com/2" },
      ),
    ).toBe("https://example.com/1")
    expect(
      resolvedPullRequestUrl({ number: null, url: null }, { url: "https://example.com/2" }),
    ).toBe("https://example.com/2")
  })

  it("orders comments and reviews by time, leaving undated reviews last", () => {
    const timeline = pullRequestTimeline({
      createdAt: "2026-08-31T09:00:00Z",
      commits: [
        {
          oid: "0123456789abcdef0123456789abcdef01234567",
          messageHeadline: "feat: add PR review",
          committedAt: "2026-08-31T10:30:00Z",
        },
      ],
      comments: [
        { author: { login: "later" }, body: "after", createdAt: "2026-08-31T12:00:00Z" },
        { author: { login: "first" }, body: "before", createdAt: "2026-08-31T10:00:00Z" },
      ],
      reviews: [
        {
          author: { login: "reviewer" },
          state: "approved",
          body: "ok",
          submittedAt: "2026-08-31T11:00:00Z",
        },
        { author: { login: "pending" }, state: "pending", body: "", submittedAt: null },
      ],
    })
    expect(
      timeline.map((item) => {
        switch (item.kind) {
          case "opened":
            return "opened"
          case "commit":
            return item.commit.oid.slice(0, 7)
          case "comment":
            return item.comment.author?.login
          case "review":
            return item.review.author?.login
        }
      }),
    ).toEqual(["opened", "first", "0123456", "reviewer", "later", "pending"])
    expect(pullRequestReviewStateLabel("changes_requested")).toBe("Requested changes")
  })

  it("resolves repository labels and review line coordinates", () => {
    expect(pullRequestRepositoryLabel("https://github.com/hezaerd/noyau/pull/42")).toBe(
      "hezaerd/noyau",
    )
    expect(pullRequestRepositoryLabel("not a url")).toBe("GitHub")
    expect(
      pullRequestLinePosition({ start: 25, end: 26, side: "additions", endSide: "deletions" }),
    ).toEqual({ line: 26, side: "left" })
  })

  it("requires words or line comments except for approvals", () => {
    expect(canSubmitPullRequestReview("approve", "", 0)).toBe(true)
    expect(canSubmitPullRequestReview("comment", "", 0)).toBe(false)
    expect(canSubmitPullRequestReview("request_changes", "Please fix", 0)).toBe(true)
    expect(canSubmitPullRequestReview("comment", "", 1)).toBe(true)
  })
})
