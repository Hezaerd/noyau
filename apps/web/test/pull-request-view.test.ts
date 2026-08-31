import { describe, expect, it } from "vite-plus/test"

import {
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
      timeline.map((item) =>
        item.kind === "comment" ? item.comment.author?.login : item.review.author?.login,
      ),
    ).toEqual(["first", "reviewer", "later", "pending"])
    expect(pullRequestReviewStateLabel("changes_requested")).toBe("Requested changes")
  })
})
