import { EnvironmentId } from "@noyau/contracts/ids"
import { ServerConfig, type ServerConfigValue } from "@noyau/server/config"
import { EditorOpen } from "@noyau/server/editor/editor-open"
import { GitPlane } from "@noyau/server/git/git-plane"
import { GitRuntime } from "@noyau/server/git/git-runtime"
import { VcsStatusBroadcaster } from "@noyau/server/git/vcs-status-broadcaster"
import { Effect, Layer, Redacted, Schema, Stream } from "effect"

const emptyStatus = (cwd: string) => ({
  isRepo: false,
  cwd,
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

export const stubVcsStatusBroadcasterLayer = (refresh: (cwd: string) => void = () => undefined) =>
  Layer.succeed(VcsStatusBroadcaster)({
    streamStatus: (cwd) => Stream.make({ _tag: "snapshot" as const, status: emptyStatus(cwd) }),
    refresh: (cwd) =>
      Effect.sync(() => {
        refresh(cwd)
        return emptyStatus(cwd)
      }),
  })

export const stubGitRuntimeLayer = Layer.succeed(GitRuntime)({
  status: (cwd) => Effect.succeed(emptyStatus(cwd)),
  listRefs: () => Effect.succeed([]),
  listWorktrees: () => Effect.succeed([]),
  switchRef: (_cwd, refName) =>
    Effect.succeed({ refName, worktreePath: null, reusedWorktree: false }),
  createRef: (_cwd, refName) => Effect.succeed({ refName }),
  createWorktree: (input) =>
    Effect.succeed({ worktree: { path: `${input.worktreesDir}/stub`, refName: input.branch } }),
  renameBranch: (input) => Effect.succeed({ branch: input.newBranch }),
  isGitRepository: () => Effect.succeed(false),
  captureCheckpoint: () => Effect.void,
  hasCheckpointRef: () => Effect.succeed(false),
  diffCheckpoints: () => Effect.succeed(""),
  diffContext: () => Effect.succeed(""),
  runStackedAction: (input) =>
    Effect.succeed({
      action: input.action,
      branch: null,
      commit: { status: "skipped_not_requested" },
      push: { status: "skipped_not_requested" },
      pullRequest: { status: "skipped_not_requested" },
    }),
  githubAccount: () => Effect.succeed({ login: null }),
  getPullRequest: (_cwd, number) =>
    Effect.succeed({
      number,
      title: `PR ${number}`,
      url: `https://github.com/hezaerd/noyau/pull/${number}`,
      body: "",
      author: null,
      state: "open",
      baseRef: "main",
      headRef: "feat",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      additions: 0,
      deletions: 0,
      mergeability: "unknown",
      ciStatus: "none",
      failedChecks: [],
      reviews: [],
      comments: [],
      commits: [],
      files: [],
      patch: "",
    }),
  submitPullRequestReview: () => Effect.succeed({}),
  publishRepository: (input) =>
    Effect.succeed({
      nameWithOwner: input.repository,
      url: `https://github.com/${input.repository}`,
      remoteName: "origin",
      branch: null,
      status: "remote_added",
    }),
})

export const stubEditorOpenLayer = Layer.succeed(EditorOpen)({
  list: Effect.succeed({ editors: ["cursor"] }),
  open: (input) => Effect.succeed({ editor: input.editor, cwd: "/tmp/stub" }),
})

export const stubGitPlaneLayer = Layer.succeed(GitPlane)({
  status: (scope) => Effect.succeed(emptyStatus(scope.projectId)),
  subscribeStatus: (scope) =>
    Stream.make({ _tag: "snapshot" as const, status: emptyStatus(scope.projectId) }),
  listRefs: () => Effect.succeed({ isRepo: false, refs: [] }),
  switchRef: (input) =>
    Effect.succeed({ refName: input.refName, worktreePath: null, reusedWorktree: false }),
  createRef: (input) => Effect.succeed({ refName: input.refName }),
  createWorktree: (input) =>
    Effect.succeed({
      worktree: {
        path: `/tmp/stub/${input.baseBranch}`,
        refName: input.branch ?? input.baseBranch,
      },
    }),
  draft: () => Effect.succeed({ title: "stub draft" }),
  runStackedAction: (input) =>
    Effect.succeed({
      action: input.action,
      branch: null,
      commit: { status: "skipped_not_requested" },
      push: { status: "skipped_not_requested" },
      pullRequest: { status: "skipped_not_requested" },
    }),
  githubAccount: () => Effect.succeed({ login: null }),
  getPullRequest: (input) =>
    Effect.succeed({
      number: input.number,
      title: `PR ${input.number}`,
      url: `https://github.com/hezaerd/noyau/pull/${input.number}`,
      body: "",
      author: null,
      state: "open",
      baseRef: "main",
      headRef: "feat",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      additions: 0,
      deletions: 0,
      mergeability: "unknown",
      ciStatus: "none",
      failedChecks: [],
      reviews: [],
      comments: [],
      commits: [],
      files: [],
      patch: "",
    }),
  submitPullRequestReview: () => Effect.succeed({}),
  publishRepository: (input) =>
    Effect.succeed({
      nameWithOwner: input.repository,
      url: `https://github.com/${input.repository}`,
      remoteName: "origin",
      branch: null,
      status: "remote_added",
    }),
})

export const testServerConfig = (overrides: Partial<ServerConfigValue> = {}): ServerConfigValue => {
  const dataDirectory = overrides.dataDirectory ?? "/tmp/noyau-test"
  const configDirectory = overrides.configDirectory ?? dataDirectory
  return {
    environment: "test",
    worktreesDir: "/tmp/noyau-test/worktrees",
    databaseFile: ":memory:",
    host: "127.0.0.1",
    port: 0,
    bearerToken: Redacted.make("test-launch-token"),
    actorId: "human:test",
    environmentId: Schema.decodeSync(EnvironmentId)("90000000-0000-4000-8000-000000000001"),
    environmentCreatedAt: Schema.decodeSync(Schema.DateTimeUtcFromString)(
      "2026-08-20T00:00:00.000Z",
    ),
    bootstrapVersion: "1",
    bundleVersion: "0.1.0-test",
    serverVersion: "0.1.0-test",
    ...overrides,
    dataDirectory,
    configDirectory,
  }
}

export const testServerConfigLayer = (overrides: Partial<ServerConfigValue> = {}) =>
  Layer.succeed(ServerConfig)(testServerConfig(overrides))
