import * as NodeServices from "@effect/platform-node/NodeServices"
import { assert, describe, expect, it, layer } from "@effect/vitest"
import { ProjectId } from "@noyau/contracts/ids"
import { GitPlane, gitPlaneLayer } from "@noyau/server/git/git-plane"
import {
  buildGeneratedWorktreeBranchName,
  buildTemporaryWorktreeBranchName,
  deriveRepositoryUrlFromCreateOutput,
  DEFAULT_PR_LOOKUP_CACHE_TTL,
  INITIAL_PR_LOOKUP_FAILURE_TTL,
  isTemporaryWorktreeBranch,
  MAX_PR_LOOKUP_FAILURE_TTL,
  prLookupFailureTtl,
  sanitizeWorktreeFolderName,
  unavailableVcsStatus,
  GitRuntime,
  gitRuntimeLayer,
} from "@noyau/server/git/git-runtime"
import { runGit } from "@noyau/server/git/run-command"
import { memoryLayer } from "@noyau/server/persistence/sqlite"
import { unavailableTextGenerationLayer } from "@noyau/server/text-generation/text-generation"
import { Duration, Effect, FileSystem, Layer, Path, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { testServerConfigLayer } from "./fixtures.ts"

describe("GitRuntime helpers", () => {
  it("forme une branche temporaire noyau/<8 hex>", () => {
    expect(buildTemporaryWorktreeBranchName("F4AE4E0E-f971")).toBe("noyau/f4ae4e0e")
    expect(buildTemporaryWorktreeBranchName("ab")).toBe("noyau/ab000000")
  })

  it("reconnaît les branches temporaires noyau/<8 hex> et UUID v4", () => {
    expect(isTemporaryWorktreeBranch("noyau/f4ae4e0e")).toBe(true)
    expect(isTemporaryWorktreeBranch(" NOYAU/DEADBEEF ")).toBe(true)
    expect(isTemporaryWorktreeBranch("noyau/f4ae4e0e-f971-4d48-b4f2-9cf0aa54ab12")).toBe(true)
    expect(isTemporaryWorktreeBranch("noyau/safer-reconnect")).toBe(false)
    expect(isTemporaryWorktreeBranch("noyau/deadbeef-extra")).toBe(false)
    expect(isTemporaryWorktreeBranch("main")).toBe(false)
  })

  it("aplatit la branche en un seul nom de dossier worktree", () => {
    expect(sanitizeWorktreeFolderName("noyau/f4ae4e0e")).toBe("f4ae4e0e")
    expect(sanitizeWorktreeFolderName("noyau/safer-reconnect")).toBe("safer-reconnect")
    expect(sanitizeWorktreeFolderName("noyau/feature/demo")).toBe("feature-demo")
    expect(sanitizeWorktreeFolderName("   ")).toBe("worktree")
  })

  it("sanitize un nom généré en noyau/<slug>", () => {
    expect(buildGeneratedWorktreeBranchName("Safer reconnect backoff")).toBe(
      "noyau/safer-reconnect-backoff",
    )
    expect(buildGeneratedWorktreeBranchName("noyau/safer-reconnect")).toBe("noyau/safer-reconnect")
    expect(buildGeneratedWorktreeBranchName("refs/heads/feature/demo")).toBe("noyau/feature/demo")
    expect(buildGeneratedWorktreeBranchName("   ")).toBe("noyau/update")
  })

  it("lit l’URL canonique de gh repo create", () => {
    expect(
      deriveRepositoryUrlFromCreateOutput("https://github.com/hezaerd/noyau\n", "ignored/fallback"),
    ).toEqual({
      nameWithOwner: "hezaerd/noyau",
      url: "https://github.com/hezaerd/noyau",
    })
    expect(deriveRepositoryUrlFromCreateOutput("", "hezaerd/noyau")).toEqual({
      nameWithOwner: "hezaerd/noyau",
      url: "https://github.com/hezaerd/noyau",
    })
  })

  it("représente un cwd manquant comme un status VCS indisponible", () => {
    expect(unavailableVcsStatus("/missing/worktree")).toEqual({
      isRepo: false,
      cwd: "/missing/worktree",
      refName: null,
      isDefaultRef: false,
      hasPrimaryRemote: false,
      hasWorkingTreeChanges: false,
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      worktreePath: null,
      pr: null,
    })
  })

  it("applique un TTL de PR de deux minutes et un backoff plafonné", () => {
    expect(Duration.toSeconds(DEFAULT_PR_LOOKUP_CACHE_TTL)).toBe(120)
    expect(Duration.toSeconds(prLookupFailureTtl(1))).toBe(
      Duration.toSeconds(INITIAL_PR_LOOKUP_FAILURE_TTL),
    )
    expect(Duration.toSeconds(prLookupFailureTtl(2))).toBe(40)
    expect(Duration.toSeconds(prLookupFailureTtl(7))).toBe(
      Duration.toSeconds(MAX_PR_LOOKUP_FAILURE_TTL),
    )
    expect(Duration.toSeconds(prLookupFailureTtl(100))).toBe(
      Duration.toSeconds(MAX_PR_LOOKUP_FAILURE_TTL),
    )
  })
})

const runtimeTestLayer = Layer.mergeAll(gitRuntimeLayer, NodeServices.layer)

const beginGitTrace = (trace: string) => {
  const previousTrace = process.env.GIT_TRACE2_EVENT
  process.env.GIT_TRACE2_EVENT = trace
  return previousTrace
}

const restoreGitTrace = (previousTrace: string | undefined) => {
  if (previousTrace === undefined) delete process.env.GIT_TRACE2_EVENT
  else process.env.GIT_TRACE2_EVENT = previousTrace
}

layer(runtimeTestLayer)("GitRuntime refs", (runtimeIt) => {
  runtimeIt.effect("distinguishes non-repositories from unborn repositories", () =>
    Effect.gen(function* () {
      const git = yield* GitRuntime
      const fileSystem = yield* FileSystem.FileSystem
      const outside = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-refs-outside-" })
      const unborn = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-refs-unborn-" })
      yield* runGit("git.init", unborn, ["init", "-b", "main"])

      assert.deepStrictEqual(yield* git.listRefs(outside), { isRepo: false, refs: [] })
      assert.deepStrictEqual(yield* git.listRefs(unborn), { isRepo: true, refs: [] })
    }),
  )
})

const planeTestLayer = gitPlaneLayer.pipe(
  Layer.provideMerge(memoryLayer),
  Layer.provideMerge(testServerConfigLayer()),
  Layer.provideMerge(unavailableTextGenerationLayer),
  Layer.provideMerge(NodeServices.layer),
)
const refsProjectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")

layer(planeTestLayer)("GitPlane refs", (planeIt) => {
  planeIt.effect("returns ref metadata without status or upstream commands", () =>
    Effect.gen(function* () {
      const gitPlane = yield* GitPlane
      const sql = yield* SqlClient
      const fileSystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-refs-repo-" })
      const linked = yield* fileSystem.makeTempDirectoryScoped({ prefix: "noyau-refs-linked-" })
      const trace = path.join(cwd, "git-trace.json")
      yield* runGit("git.init", cwd, ["init", "-b", "main"])
      yield* runGit("git.config-email", cwd, ["config", "user.email", "test@noyau.local"])
      yield* runGit("git.config-name", cwd, ["config", "user.name", "Noyau Test"])
      yield* fileSystem.writeFileString(path.join(cwd, "README.md"), "hello\n")
      yield* runGit("git.add", cwd, ["add", "README.md"])
      yield* runGit("git.commit", cwd, ["commit", "-m", "init"])
      yield* runGit("git.branch.feature", cwd, ["branch", "feature"])
      yield* runGit("git.remote-ref", cwd, ["update-ref", "refs/remotes/origin/main", "HEAD"])
      yield* runGit("git.remote-head", cwd, [
        "symbolic-ref",
        "refs/remotes/origin/HEAD",
        "refs/remotes/origin/main",
      ])
      yield* runGit("git.worktree.add", cwd, ["worktree", "add", linked, "feature"])
      yield* sql`
        INSERT INTO projection_projects (
          project_id, name, workspace_root, available, created_at, updated_at
        ) VALUES (
          ${refsProjectId}, 'Refs', ${cwd}, 1,
          '2026-08-20T00:00:00.000Z', '2026-08-20T00:00:00.000Z'
        )
      `

      const result = yield* Effect.acquireUseRelease(
        Effect.sync(() => beginGitTrace(trace)),
        () => gitPlane.listRefs({ projectId: refsProjectId }),
        (previousTrace) => Effect.sync(() => restoreGitTrace(previousTrace)),
      )
      const normalizedCwd = cwd.replaceAll("\\", "/")
      const normalizedLinked = linked.replaceAll("\\", "/")

      assert.isTrue(result.isRepo)
      expect(result.refs).toContainEqual({
        name: "main",
        isRemote: false,
        current: true,
        isDefault: true,
        worktreePath: normalizedCwd,
      })
      expect(result.refs).toContainEqual({
        name: "feature",
        isRemote: false,
        current: false,
        isDefault: false,
        worktreePath: normalizedLinked,
      })
      expect(result.refs).toContainEqual({
        name: "origin/main",
        isRemote: true,
        current: false,
        isDefault: true,
        worktreePath: null,
      })

      const invocations = yield* fileSystem.readFileString(trace)
      assert.match(invocations, /"event":"start"/)
      assert.strictEqual(invocations.match(/--is-inside-work-tree/g)?.length, 1)
      assert.include(invocations, "for-each-ref")
      assert.notInclude(invocations, '"status"')
      assert.notInclude(invocations, "@{upstream}")
    }),
  )
})
