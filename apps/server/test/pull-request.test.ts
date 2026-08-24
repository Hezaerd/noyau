import { describe, expect, it } from "@effect/vitest"
import {
  decodeListedPullRequests,
  normalizeMergeability,
  normalizePullRequestState,
  selectStatusPullRequest,
  toListedPullRequest,
} from "@noyau/server/git/pull-request"
import { Effect, Exit } from "effect"

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

  it.effect("décode une liste gh ou un stdout vide", () =>
    Effect.gen(function* () {
      const empty = yield* decodeListedPullRequests("  \n")
      expect(empty).toEqual([])
      const listed = yield* decodeListedPullRequests(
        '[{"number":7,"title":"Live PR","url":"https://github.com/hezaerd/noyau/pull/7","baseRefName":"main","headRefName":"feat/live","state":"OPEN","mergeable":"CONFLICTING","updatedAt":"2026-08-23T12:00:00Z"}]',
      )
      expect(listed[0]?.number).toBe(7)
      expect(listed[0]?.state).toBe("open")
      expect(listed[0]?.mergeability).toBe("conflicting")
      const invalid = yield* Effect.exit(decodeListedPullRequests("{"))
      expect(Exit.isFailure(invalid)).toBe(true)
    }),
  )
})
