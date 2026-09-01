import { describe, expect, it } from "@effect/vitest"
import { GitCommandError } from "@noyau/contracts/git"
import { unavailableVcsStatus } from "@noyau/server/git/git-runtime"
import {
  DEFAULT_VCS_STATUS_REFRESH_INTERVAL,
  recoverVcsStatusSnapshot,
} from "@noyau/server/git/vcs-status-broadcaster"
import { Duration, Effect } from "effect"

describe("VcsStatusBroadcaster snapshot recovery", () => {
  it("polls each active worktree every thirty seconds by default", () => {
    expect(Duration.toSeconds(DEFAULT_VCS_STATUS_REFRESH_INTERVAL)).toBe(30)
  })

  it("turns a missing-worktree git failure into an unavailable status", () =>
    Effect.runPromise(
      recoverVcsStatusSnapshot(
        "/missing/worktree",
        Effect.fail(
          new GitCommandError({
            operation: "git.rev-parse",
            detail: "ENOENT: no such file or directory",
          }),
        ),
      ).pipe(
        Effect.map((status) => {
          expect(status).toEqual(unavailableVcsStatus("/missing/worktree"))
        }),
      ),
    ))

  it("keeps a successful status", () => {
    const status = unavailableVcsStatus("/tmp/repo")
    return Effect.runPromise(
      recoverVcsStatusSnapshot("/tmp/repo", Effect.succeed(status)).pipe(
        Effect.map((recovered) => {
          expect(recovered).toBe(status)
        }),
      ),
    )
  })
})
