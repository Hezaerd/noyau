import * as NodeServices from "@effect/platform-node/NodeServices"
import {
  GitCommandError,
  type GitHubAccountResult,
  type GitPublishRepositoryResult,
  type GitRepositoryVisibility,
  type GitRunStackedActionResult,
  type GitStackedAction,
  type VcsCreateRefResult,
  type VcsCreateWorktreeResult,
  type VcsRef,
  type VcsRemoveWorktreeResult,
  type VcsStatusResult,
  type VcsSwitchRefResult,
  type VcsWorktree,
} from "@noyau/protocol/git"
import { Context, Effect, FileSystem, Layer, Path, Schema, type Scope } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"

import {
  decodeListedPullRequests,
  selectStatusPullRequest,
  type ListedPullRequest,
} from "./pull-request.ts"
import { runGh, runGit } from "./run-command.ts"

const PR_LIST_JSON_FIELDS =
  "number,title,url,baseRefName,headRefName,state,mergeable,updatedAt,statusCheckRollup"

const ExistingPullRequest = Schema.Struct({
  url: Schema.optionalKey(Schema.String),
  number: Schema.optionalKey(Schema.Int),
})
const decodeExistingPullRequest = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ExistingPullRequest),
)

export const WORKTREE_BRANCH_PREFIX = "noyau"
// Canonical form is `noyau/<8 hex>`. The matcher also accepts the older
// `noyau/<uuid>` shape (RFC 4122 v4) so leftover checkouts stay eligible
// for regeneration.
const TEMP_WORKTREE_BRANCH_PATTERN = new RegExp(
  `^${WORKTREE_BRANCH_PREFIX}\\/(?:[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$`,
)

export const buildTemporaryWorktreeBranchName = (hex: string): string => {
  const token = hex
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "")
    .slice(0, 8)
    .padEnd(8, "0")
  return `${WORKTREE_BRANCH_PREFIX}/${token}`
}

export const isTemporaryWorktreeBranch = (refName: string): boolean =>
  TEMP_WORKTREE_BRANCH_PATTERN.test(refName.trim().toLowerCase())

/** Primary checkout is the first porcelain entry (`git worktree list`). */
export const resolveWorktreeRemoval = (
  worktrees: ReadonlyArray<VcsWorktree>,
  path: string,
):
  | { readonly kind: "remove" }
  | { readonly kind: "already-gone" }
  | { readonly kind: "reject"; readonly detail: string } => {
  const primary = worktrees[0]
  if (primary !== undefined && primary.path === path) {
    return { kind: "reject", detail: "Cannot remove the primary checkout." }
  }
  if (!worktrees.some((worktree) => worktree.path === path)) {
    return { kind: "already-gone" }
  }
  return { kind: "remove" }
}

/** Sanitize a model-produced fragment into `noyau/<slug>`. */
export const buildGeneratedWorktreeBranchName = (raw: string): string => {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/^refs\/heads\//, "")
    .replace(/['"`]/g, "")
  const withoutPrefix = normalized.startsWith(`${WORKTREE_BRANCH_PREFIX}/`)
    ? normalized.slice(`${WORKTREE_BRANCH_PREFIX}/`.length)
    : normalized
  const branchFragment = withoutPrefix
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^[./_-]+|[./_-]+$/g, "")
    .slice(0, 64)
    .replace(/[./_-]+$/g, "")
  return `${WORKTREE_BRANCH_PREFIX}/${branchFragment.length > 0 ? branchFragment : "update"}`
}

const firstLine = (value: string): string => value.split(/\r?\n/g)[0]?.trim() ?? ""

/**
 * `gh repo create` prints the canonical HTTPS URL. Parse it instead of a follow-up
 * `gh repo view`, which can race GitHub's consistency window.
 */
export const deriveRepositoryUrlFromCreateOutput = (stdout: string, repository: string) => {
  const match = stdout.match(/https?:\/\/[^\s]+/)
  const raw = match?.[0]
  if (raw !== undefined) {
    try {
      const parsed = new URL(raw.replace(/\.git$/, ""))
      const segments = parsed.pathname
        .replace(/^\/+|\/+$/g, "")
        .split("/")
        .filter(Boolean)
      const owner = segments[0]
      const name = segments[1]
      if (segments.length === 2 && owner !== undefined && name !== undefined) {
        const nameWithOwner = `${owner}/${name}`
        return { nameWithOwner, url: `${parsed.origin}/${nameWithOwner}` }
      }
    } catch {
      // Fall through to the input-derived default.
    }
  }
  return { nameWithOwner: repository, url: `https://github.com/${repository}` }
}

const parseWorktrees = (porcelain: string): ReadonlyArray<VcsWorktree> => {
  const worktrees: Array<VcsWorktree> = []
  let path = ""
  let refName = ""
  const flush = () => {
    if (path.length > 0 && refName.length > 0) {
      worktrees.push({ path, refName })
    }
    path = ""
    refName = ""
  }
  for (const raw of porcelain.split(/\r?\n/g)) {
    if (raw.length === 0) {
      flush()
      continue
    }
    if (raw.startsWith("worktree ")) {
      path = raw.slice("worktree ".length).trim()
      continue
    }
    if (raw.startsWith("branch ")) {
      refName = raw
        .slice("branch ".length)
        .replace(/^refs\/heads\//, "")
        .trim()
    }
  }
  flush()
  return worktrees
}

const deriveLocalBranchName = (refName: string): string => {
  const separator = refName.indexOf("/")
  if (separator <= 0 || separator === refName.length - 1) {
    return refName
  }
  return refName.slice(separator + 1)
}

const lastKnownPrKey = (cwd: string, branch: string): string => `${cwd}\u0000${branch}`

/** Un seul segment dossier : `noyau/safer-reconnect` → `safer-reconnect`. */
export const sanitizeWorktreeFolderName = (raw: string): string => {
  const normalized = raw.trim().toLowerCase().replace(/['"`]/g, "")
  const withoutPrefix = normalized.startsWith(`${WORKTREE_BRANCH_PREFIX}/`)
    ? normalized.slice(`${WORKTREE_BRANCH_PREFIX}/`.length)
    : normalized
  return (
    withoutPrefix
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "")
      .slice(0, 64) || "worktree"
  )
}

export interface GitStatusOptions {
  readonly includePr?: boolean
}

export interface GitRuntimeService {
  readonly status: (
    cwd: string,
    options?: GitStatusOptions,
  ) => Effect.Effect<VcsStatusResult, GitCommandError>
  readonly listRefs: (cwd: string) => Effect.Effect<ReadonlyArray<VcsRef>, GitCommandError>
  readonly listWorktrees: (
    cwd: string,
  ) => Effect.Effect<ReadonlyArray<VcsWorktree>, GitCommandError>
  readonly switchRef: (
    cwd: string,
    refName: string,
  ) => Effect.Effect<VcsSwitchRefResult, GitCommandError>
  readonly createRef: (
    cwd: string,
    refName: string,
    switchRef: boolean,
  ) => Effect.Effect<VcsCreateRefResult, GitCommandError>
  readonly createWorktree: (input: {
    readonly cwd: string
    readonly worktreesDir: string
    readonly baseBranch: string
    readonly branch: string
    readonly startFromOrigin?: boolean
  }) => Effect.Effect<VcsCreateWorktreeResult, GitCommandError>
  readonly removeWorktree: (input: {
    readonly cwd: string
    readonly path: string
    readonly force?: boolean
  }) => Effect.Effect<Pick<VcsRemoveWorktreeResult, "path">, GitCommandError>
  readonly renameBranch: (input: {
    readonly cwd: string
    readonly oldBranch: string
    readonly newBranch: string
  }) => Effect.Effect<{ readonly branch: string }, GitCommandError>
  readonly isGitRepository: (cwd: string) => Effect.Effect<boolean, GitCommandError>
  readonly captureCheckpoint: (input: {
    readonly cwd: string
    readonly checkpointRef: string
  }) => Effect.Effect<void, GitCommandError>
  readonly hasCheckpointRef: (input: {
    readonly cwd: string
    readonly checkpointRef: string
  }) => Effect.Effect<boolean, GitCommandError>
  readonly diffCheckpoints: (input: {
    readonly cwd: string
    readonly fromCheckpointRef: string
    readonly toCheckpointRef: string
    readonly format?: "numstat" | "patch"
    readonly ignoreWhitespace?: boolean
  }) => Effect.Effect<string, GitCommandError>
  readonly diffContext: (cwd: string) => Effect.Effect<string, GitCommandError>
  readonly runStackedAction: (input: {
    readonly cwd: string
    readonly action: GitStackedAction
    readonly commitMessage?: string
    readonly pullRequestTitle?: string
    readonly pullRequestBody?: string
  }) => Effect.Effect<GitRunStackedActionResult, GitCommandError>
  readonly githubAccount: (cwd: string) => Effect.Effect<GitHubAccountResult, GitCommandError>
  readonly publishRepository: (input: {
    readonly cwd: string
    readonly repository: string
    readonly visibility: GitRepositoryVisibility
  }) => Effect.Effect<GitPublishRepositoryResult, GitCommandError>
}

export class GitRuntime extends Context.Service<GitRuntime, GitRuntimeService>()(
  "@noyau/server/git/GitRuntime",
) {}

const isRepo = Effect.fn("GitRuntime.isRepo")(function* (cwd: string) {
  const result = yield* runGit("git.rev-parse", cwd, ["rev-parse", "--is-inside-work-tree"], {
    allowNonZero: true,
  })
  return result.code === 0 && firstLine(result.stdout) === "true"
})

const currentBranch = Effect.fn("GitRuntime.currentBranch")(function* (cwd: string) {
  const result = yield* runGit("git.branch", cwd, ["branch", "--show-current"], {
    allowNonZero: true,
  })
  const name = firstLine(result.stdout)
  return name.length === 0 ? null : name
})

const listWorktrees = Effect.fn("GitRuntime.listWorktrees")(function* (cwd: string) {
  const result = yield* runGit("git.worktree.list", cwd, ["worktree", "list", "--porcelain"], {
    allowNonZero: true,
  })
  if (result.code !== 0) {
    return []
  }
  return parseWorktrees(result.stdout)
})

const makeGitRuntime = Effect.fn("GitRuntime.make")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const path = yield* Path.Path
  const fileSystem = yield* FileSystem.FileSystem
  const enclose = <A>(
    effect: Effect.Effect<
      A,
      GitCommandError,
      ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
    >,
  ) =>
    effect.pipe(
      Effect.scoped,
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    )
  const lastKnownPr = new Map<string, VcsStatusResult["pr"]>()

  const listPullRequests = Effect.fn("GitRuntime.listPullRequests")(function* (
    cwd: string,
    head: string,
    state: "open" | "all",
    limit: number,
  ) {
    const listed = yield* runGh(
      state === "open" ? "gh.pr.list.open" : "gh.pr.list.all",
      cwd,
      [
        "pr",
        "list",
        "--head",
        head,
        "--state",
        state,
        "--limit",
        String(limit),
        "--json",
        PR_LIST_JSON_FIELDS,
      ],
      { allowNonZero: true },
    )
    if (listed.code !== 0) {
      return yield* new GitCommandError({
        operation: state === "open" ? "gh.pr.list.open" : "gh.pr.list.all",
        detail: listed.stderr.trim() || listed.stdout.trim() || "gh pr list failed",
      })
    }
    return yield* decodeListedPullRequests(listed.stdout).pipe(
      Effect.mapError(
        () =>
          new GitCommandError({
            operation: "gh.pr.list",
            detail: "gh returned an invalid pull request list.",
          }),
      ),
    )
  })

  const lookupStatusPr = Effect.fn("GitRuntime.lookupStatusPr")(function* (
    cwd: string,
    details: { readonly branch: string; readonly isDefaultRef: boolean },
  ) {
    const collected: Array<ListedPullRequest> = []
    const open = yield* listPullRequests(cwd, details.branch, "open", 1)
    collected.push(...open)
    if (open.length === 0) {
      const latest = yield* listPullRequests(cwd, details.branch, "all", 20)
      collected.push(...latest)
    }
    const selected = selectStatusPullRequest(collected, { isDefaultRef: details.isDefaultRef })
    lastKnownPr.set(lastKnownPrKey(cwd, details.branch), selected)
    return selected
  })

  const status = Effect.fn("GitRuntime.status")(function* (
    cwd: string,
    options: GitStatusOptions = {},
  ) {
    const includePr = options.includePr !== false
    const repo = yield* isRepo(cwd)
    if (!repo) {
      return {
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
      } satisfies VcsStatusResult
    }
    const [refName, remotes, porcelain, defaultHead, worktrees] = yield* Effect.all(
      [
        currentBranch(cwd),
        runGit("git.remote", cwd, ["remote"], { allowNonZero: true }),
        runGit("git.status", cwd, ["status", "--porcelain"], { allowNonZero: true }),
        runGit("git.default-head", cwd, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], {
          allowNonZero: true,
        }),
        listWorktrees(cwd),
      ],
      { concurrency: "unbounded" },
    )
    const defaultRef = firstLine(defaultHead.stdout).replace(/^refs\/remotes\/origin\//, "")
    const hasPrimaryRemote = remotes.stdout.split(/\r?\n/g).some((line) => line.trim() === "origin")
    const upstream = yield* runGit(
      "git.upstream",
      cwd,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      { allowNonZero: true },
    )
    const hasUpstream = upstream.code === 0 && firstLine(upstream.stdout).length > 0
    let aheadCount = 0
    let behindCount = 0
    if (hasUpstream) {
      const counts = yield* runGit(
        "git.ahead-behind",
        cwd,
        ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
        { allowNonZero: true },
      )
      const [behind, ahead] = firstLine(counts.stdout).split(/\s+/g)
      behindCount = Number.parseInt(behind ?? "0", 10) || 0
      aheadCount = Number.parseInt(ahead ?? "0", 10) || 0
    }
    const isDefaultRef = refName !== null && defaultRef.length > 0 && refName === defaultRef
    const local = {
      isRepo: true,
      cwd,
      refName,
      isDefaultRef,
      hasPrimaryRemote,
      hasWorkingTreeChanges: porcelain.stdout.trim().length > 0,
      hasUpstream,
      aheadCount,
      behindCount,
      worktreePath: worktrees[0] !== undefined && worktrees[0].path !== cwd ? cwd : null,
      pr: refName === null ? null : (lastKnownPr.get(lastKnownPrKey(cwd, refName)) ?? null),
    } satisfies VcsStatusResult
    if (!includePr || refName === null) {
      return local
    }
    const pr = yield* lookupStatusPr(cwd, { branch: refName, isDefaultRef }).pipe(
      Effect.catchTag("GitCommandError", (error) =>
        Effect.logWarning("PR lookup failed; keeping last known PR state.").pipe(
          Effect.annotateLogs({
            operation: error.operation,
            branch: refName,
          }),
          Effect.as(local.pr),
        ),
      ),
    )
    return { ...local, pr } satisfies VcsStatusResult
  })

  const listRefs = Effect.fn("GitRuntime.listRefs")(function* (cwd: string) {
    if (!(yield* isRepo(cwd))) {
      return []
    }
    const [refs, worktrees, defaultHead, current] = yield* Effect.all(
      [
        runGit(
          "git.for-each-ref",
          cwd,
          ["for-each-ref", "--format=%(refname)\t%(HEAD)", "refs/heads", "refs/remotes"],
          { allowNonZero: true },
        ),
        listWorktrees(cwd),
        runGit("git.default-head", cwd, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], {
          allowNonZero: true,
        }),
        currentBranch(cwd),
      ],
      { concurrency: "unbounded" },
    )
    const defaultRef = firstLine(defaultHead.stdout).replace(/^refs\/remotes\//, "")
    const worktreeByRef = new Map(worktrees.map((worktree) => [worktree.refName, worktree.path]))
    return refs.stdout.split(/\r?\n/g).flatMap((line): ReadonlyArray<VcsRef> => {
      const [refname, head] = line.split("\t")
      if (refname === undefined || refname.length === 0) {
        return []
      }
      const isRemote = refname.startsWith("refs/remotes/")
      const name = refname.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\//, "")
      return [
        {
          name,
          isRemote,
          current: head === "*" || (!isRemote && name === current),
          isDefault: isRemote
            ? refname === `refs/remotes/${defaultRef}`
            : name === defaultRef.replace(/^origin\//, ""),
          worktreePath: isRemote ? null : (worktreeByRef.get(name) ?? null),
        },
      ]
    })
  })

  const switchRef = Effect.fn("GitRuntime.switchRef")(function* (cwd: string, refName: string) {
    const worktrees = yield* listWorktrees(cwd)
    const localName = refName.startsWith("origin/") ? deriveLocalBranchName(refName) : refName
    const existing = worktrees.find((worktree) => worktree.refName === localName)
    if (existing !== undefined && existing.path !== cwd) {
      return {
        refName: existing.refName,
        worktreePath: existing.path,
        reusedWorktree: true,
      } satisfies VcsSwitchRefResult
    }
    const localExists = yield* runGit(
      "git.show-ref.local",
      cwd,
      ["show-ref", "--verify", "--quiet", `refs/heads/${refName}`],
      { allowNonZero: true },
    )
    const remoteExists = yield* runGit(
      "git.show-ref.remote",
      cwd,
      ["show-ref", "--verify", "--quiet", `refs/remotes/${refName}`],
      { allowNonZero: true },
    )
    const args =
      localExists.code === 0
        ? ["checkout", refName]
        : remoteExists.code === 0
          ? ["checkout", "--track", refName]
          : ["checkout", refName]
    yield* runGit("git.checkout", cwd, args)
    const next = yield* currentBranch(cwd)
    return {
      refName: next,
      worktreePath: null,
      reusedWorktree: false,
    } satisfies VcsSwitchRefResult
  })

  const createRef = Effect.fn("GitRuntime.createRef")(function* (
    cwd: string,
    refName: string,
    shouldSwitch: boolean,
  ) {
    if (shouldSwitch) {
      yield* runGit("git.checkout-b", cwd, ["checkout", "-b", refName])
    } else {
      yield* runGit("git.branch", cwd, ["branch", refName])
    }
    return { refName } satisfies VcsCreateRefResult
  })

  const createWorktree = Effect.fn("GitRuntime.createWorktree")(function* (input: {
    readonly cwd: string
    readonly worktreesDir: string
    readonly baseBranch: string
    readonly branch: string
    readonly startFromOrigin?: boolean
  }) {
    const newRefName = input.branch
    const worktreePath = path.join(
      input.worktreesDir,
      path.basename(input.cwd),
      sanitizeWorktreeFolderName(newRefName),
    )
    let startRef = input.baseBranch
    if (input.startFromOrigin === true) {
      const fetched = yield* runGit(
        "git.fetch",
        input.cwd,
        ["fetch", "--quiet", "origin", input.baseBranch],
        { allowNonZero: true },
      )
      if (fetched.code === 0) {
        startRef = `origin/${input.baseBranch}`
      }
    }
    yield* runGit("git.worktree.add", input.cwd, [
      "worktree",
      "add",
      "-b",
      newRefName,
      worktreePath,
      startRef,
    ])
    return {
      worktree: { path: worktreePath, refName: newRefName },
    } satisfies VcsCreateWorktreeResult
  })

  const removeWorktree = Effect.fn("GitRuntime.removeWorktree")(function* (input: {
    readonly cwd: string
    readonly path: string
    readonly force?: boolean
  }) {
    const worktrees = yield* listWorktrees(input.cwd)
    const resolved = resolveWorktreeRemoval(worktrees, input.path)
    if (resolved.kind === "reject") {
      return yield* new GitCommandError({
        operation: "git.worktree.remove",
        detail: resolved.detail,
      })
    }
    if (resolved.kind === "remove") {
      const args =
        input.force === true
          ? ["worktree", "remove", "--force", "--", input.path]
          : ["worktree", "remove", "--", input.path]
      yield* runGit("git.worktree.remove", input.cwd, args)
    }
    return { path: input.path }
  })

  const branchExists = Effect.fn("GitRuntime.branchExists")(function* (
    cwd: string,
    refName: string,
  ) {
    const result = yield* runGit(
      "git.show-ref.branch",
      cwd,
      ["show-ref", "--verify", "--quiet", `refs/heads/${refName}`],
      { allowNonZero: true },
    )
    return result.code === 0
  })

  const resolveAvailableBranchName = Effect.fn("GitRuntime.resolveAvailableBranchName")(function* (
    cwd: string,
    desiredBranch: string,
  ) {
    if (!(yield* branchExists(cwd, desiredBranch))) {
      return desiredBranch
    }
    for (let suffix = 2; suffix <= 100; suffix += 1) {
      const candidate = `${desiredBranch}-${suffix}`
      if (!(yield* branchExists(cwd, candidate))) {
        return candidate
      }
    }
    return yield* new GitCommandError({
      operation: "git.branch.rename",
      detail: `Could not find an available branch name for '${desiredBranch}'.`,
    })
  })

  const renameBranch = Effect.fn("GitRuntime.renameBranch")(function* (input: {
    readonly cwd: string
    readonly oldBranch: string
    readonly newBranch: string
  }) {
    if (input.oldBranch === input.newBranch) {
      return { branch: input.newBranch }
    }
    const targetBranch = yield* resolveAvailableBranchName(input.cwd, input.newBranch)
    yield* runGit("git.branch.rename", input.cwd, [
      "branch",
      "-m",
      "--",
      input.oldBranch,
      targetBranch,
    ])
    return { branch: targetBranch }
  })

  const gitCommonDir = Effect.fn("GitRuntime.gitCommonDir")(function* (cwd: string) {
    const result = yield* runGit("git.common-dir", cwd, ["rev-parse", "--git-common-dir"])
    const raw = firstLine(result.stdout)
    return path.isAbsolute(raw) ? raw : path.join(cwd, raw)
  })

  const captureCheckpoint = Effect.fn("GitRuntime.captureCheckpoint")(function* (input: {
    readonly cwd: string
    readonly checkpointRef: string
  }) {
    const commonDir = yield* gitCommonDir(input.cwd)
    const indexName = input.checkpointRef.replace(/[/\\:]/g, "-")
    const tempIndexPath = path.join(commonDir, `noyau-checkpoint-index-${indexName}`)
    const env = {
      GIT_INDEX_FILE: tempIndexPath,
      GIT_AUTHOR_NAME: "Noyau",
      GIT_AUTHOR_EMAIL: "noyau@users.noreply.github.com",
      GIT_COMMITTER_NAME: "Noyau",
      GIT_COMMITTER_EMAIL: "noyau@users.noreply.github.com",
    }
    yield* Effect.gen(function* () {
      const head = yield* runGit(
        "git.rev-parse-head",
        input.cwd,
        ["rev-parse", "--verify", "HEAD"],
        { allowNonZero: true },
      )
      if (head.code === 0) {
        yield* runGit("git.read-tree", input.cwd, ["read-tree", "HEAD"], { env })
      }
      yield* runGit("git.add", input.cwd, ["add", "-A", "--", "."], { env })
      const tree = yield* runGit("git.write-tree", input.cwd, ["write-tree"], { env })
      const treeOid = firstLine(tree.stdout)
      if (treeOid.length === 0) {
        return yield* new GitCommandError({
          operation: "git.write-tree",
          detail: "git write-tree returned an empty tree oid.",
        })
      }
      const commit = yield* runGit(
        "git.commit-tree",
        input.cwd,
        ["commit-tree", treeOid, "-m", `noyau checkpoint ${input.checkpointRef}`],
        { env },
      )
      const commitOid = firstLine(commit.stdout)
      if (commitOid.length === 0) {
        return yield* new GitCommandError({
          operation: "git.commit-tree",
          detail: "git commit-tree returned an empty commit oid.",
        })
      }
      yield* runGit("git.update-ref", input.cwd, ["update-ref", input.checkpointRef, commitOid])
    }).pipe(Effect.ensuring(fileSystem.remove(tempIndexPath, { force: true }).pipe(Effect.ignore)))
  })

  const hasCheckpointRef = Effect.fn("GitRuntime.hasCheckpointRef")(function* (input: {
    readonly cwd: string
    readonly checkpointRef: string
  }) {
    const result = yield* runGit(
      "git.rev-parse-checkpoint",
      input.cwd,
      ["rev-parse", "--verify", "--quiet", input.checkpointRef],
      { allowNonZero: true },
    )
    return result.code === 0 && firstLine(result.stdout).length > 0
  })

  const diffCheckpoints = Effect.fn("GitRuntime.diffCheckpoints")(function* (input: {
    readonly cwd: string
    readonly fromCheckpointRef: string
    readonly toCheckpointRef: string
    readonly format?: "numstat" | "patch"
    readonly ignoreWhitespace?: boolean
  }) {
    const format = input.format ?? "numstat"
    const operation = format === "patch" ? "git.diff-patch" : "git.diff-numstat"
    const fromRef =
      format === "patch" ? `${input.fromCheckpointRef}^{commit}` : input.fromCheckpointRef
    const toRef = format === "patch" ? `${input.toCheckpointRef}^{commit}` : input.toCheckpointRef
    const result = yield* runGit(
      operation,
      input.cwd,
      [
        "diff",
        format === "patch" ? "--patch" : "--numstat",
        ...(format === "patch" ? ["--no-color", "--no-ext-diff", "--no-textconv"] : []),
        ...(input.ignoreWhitespace === true ? ["--ignore-all-space"] : []),
        fromRef,
        toRef,
      ],
      { allowNonZero: true },
    )
    if (result.code !== 0 && result.code !== 1) {
      return yield* new GitCommandError({
        operation,
        detail: result.stderr.trim() || result.stdout.trim() || `${operation} failed`,
      })
    }
    return result.stdout
  })

  const diffContext = Effect.fn("GitRuntime.diffContext")(function* (cwd: string) {
    const [stat, diff, log] = yield* Effect.all(
      [
        runGit("git.status", cwd, ["status", "--short"], { allowNonZero: true }),
        runGit("git.diff", cwd, ["diff", "--stat"], { allowNonZero: true }),
        runGit("git.log", cwd, ["log", "-8", "--oneline"], { allowNonZero: true }),
      ],
      { concurrency: "unbounded" },
    )
    return [`STATUS:\n${stat.stdout}`, `DIFF:\n${diff.stdout}`, `LOG:\n${log.stdout}`].join("\n\n")
  })

  const runStackedAction = Effect.fn("GitRuntime.runStackedAction")(function* (input: {
    readonly cwd: string
    readonly action: GitStackedAction
    readonly commitMessage?: string
    readonly pullRequestTitle?: string
    readonly pullRequestBody?: string
  }) {
    const wantsCommit =
      input.action === "commit" ||
      input.action === "commit_push" ||
      input.action === "commit_push_pr"
    const wantsPush =
      input.action === "push" || input.action === "commit_push" || input.action === "commit_push_pr"
    const wantsPr = input.action === "create_pr" || input.action === "commit_push_pr"
    const branch = yield* currentBranch(input.cwd)
    let commit: GitRunStackedActionResult["commit"] = { status: "skipped_not_requested" }
    let push: GitRunStackedActionResult["push"] = { status: "skipped_not_requested" }
    let pullRequest: GitRunStackedActionResult["pullRequest"] = { status: "skipped_not_requested" }
    if (wantsCommit) {
      const message = input.commitMessage?.trim()
      if (message === undefined || message.length === 0) {
        return yield* new GitCommandError({
          operation: "git.commit",
          detail: "A commit message is required.",
        })
      }
      yield* runGit("git.add", input.cwd, ["add", "-A"])
      const staged = yield* runGit("git.diff-cached", input.cwd, ["diff", "--cached", "--quiet"], {
        allowNonZero: true,
      })
      if (staged.code === 0) {
        commit = { status: "skipped_no_changes" }
      } else {
        yield* runGit("git.commit", input.cwd, ["commit", "-m", message])
        const sha = firstLine(
          (yield* runGit("git.rev-parse", input.cwd, ["rev-parse", "HEAD"])).stdout,
        )
        commit = { status: "created", commitSha: sha, subject: firstLine(message) }
      }
    }
    if (wantsPush) {
      const pushed = yield* runGit("git.push", input.cwd, ["push", "-u", "origin", "HEAD"], {
        allowNonZero: true,
      })
      if (pushed.code !== 0) {
        return yield* new GitCommandError({
          operation: "git.push",
          detail: pushed.stderr.trim() || pushed.stdout.trim() || "git push failed",
        })
      }
      push = { status: "pushed" }
    }
    if (wantsPr) {
      const title = input.pullRequestTitle?.trim() ?? input.commitMessage?.trim()
      if (title === undefined || title.length === 0) {
        return yield* new GitCommandError({
          operation: "gh.pr.create",
          detail: "A pull request title is required.",
        })
      }
      const created = yield* runGh(
        "gh.pr.create",
        input.cwd,
        ["pr", "create", "--title", title, "--body", input.pullRequestBody ?? ""],
        { allowNonZero: true },
      )
      if (created.code === 0) {
        const url = firstLine(created.stdout)
        pullRequest = { status: "created", url }
      } else {
        const existing = yield* runGh(
          "gh.pr.view",
          input.cwd,
          ["pr", "view", "--json", "url,number"],
          { allowNonZero: true },
        )
        if (existing.code !== 0) {
          return yield* new GitCommandError({
            operation: "gh.pr.create",
            detail: created.stderr.trim() || created.stdout.trim() || "gh pr create failed",
          })
        }
        const parsed = yield* decodeExistingPullRequest(existing.stdout).pipe(
          Effect.mapError(
            () =>
              new GitCommandError({
                operation: "gh.pr.view",
                detail: "gh returned an invalid pull request payload.",
              }),
          ),
        )
        pullRequest = Object.assign(
          { status: "opened_existing" as const },
          parsed.url === undefined ? {} : { url: parsed.url },
          parsed.number === undefined ? {} : { number: parsed.number },
        )
      }
    }
    return { action: input.action, branch, commit, push, pullRequest }
  })

  const githubAccount = Effect.fn("GitRuntime.githubAccount")(function* (cwd: string) {
    const result = yield* runGh("gh.api.user", cwd, ["api", "user", "--jq", ".login"], {
      allowNonZero: true,
    }).pipe(
      Effect.catchTag("GitCommandError", () => Effect.succeed({ stdout: "", stderr: "", code: 1 })),
    )
    const login = firstLine(result.stdout)
    return { login: result.code === 0 && login.length > 0 ? login : null }
  })

  const publishRepository = Effect.fn("GitRuntime.publishRepository")(function* (input: {
    readonly cwd: string
    readonly repository: string
    readonly visibility: GitRepositoryVisibility
  }) {
    const repository = input.repository.trim()
    const created = yield* runGh("gh.repo.create", input.cwd, [
      "repo",
      "create",
      repository,
      `--${input.visibility}`,
    ])
    const urls = deriveRepositoryUrlFromCreateOutput(created.stdout, repository)
    yield* runGit("git.remote.add", input.cwd, ["remote", "add", "origin", urls.url])
    const head = yield* runGit("git.rev-parse.head", input.cwd, ["rev-parse", "--verify", "HEAD"], {
      allowNonZero: true,
    })
    const branch = yield* currentBranch(input.cwd)
    if (head.code !== 0) {
      return {
        nameWithOwner: urls.nameWithOwner,
        url: urls.url,
        remoteName: "origin",
        branch,
        status: "remote_added",
      } satisfies GitPublishRepositoryResult
    }
    const pushed = yield* runGit("git.push", input.cwd, ["push", "-u", "origin", "HEAD"], {
      allowNonZero: true,
    })
    if (pushed.code !== 0) {
      return yield* new GitCommandError({
        operation: "git.push",
        detail: pushed.stderr.trim() || pushed.stdout.trim() || "git push failed",
      })
    }
    return {
      nameWithOwner: urls.nameWithOwner,
      url: urls.url,
      remoteName: "origin",
      branch,
      status: "pushed",
    } satisfies GitPublishRepositoryResult
  })

  return GitRuntime.of({
    status: (cwd, options) => enclose(status(cwd, options)),
    listRefs: (cwd) => enclose(listRefs(cwd)),
    listWorktrees: (cwd) => enclose(listWorktrees(cwd)),
    switchRef: (cwd, refName) => enclose(switchRef(cwd, refName)),
    createRef: (cwd, refName, shouldSwitch) => enclose(createRef(cwd, refName, shouldSwitch)),
    createWorktree: (input) => enclose(createWorktree(input)),
    removeWorktree: (input) => enclose(removeWorktree(input)),
    renameBranch: (input) => enclose(renameBranch(input)),
    isGitRepository: (cwd) => enclose(isRepo(cwd)),
    captureCheckpoint: (input) => enclose(captureCheckpoint(input)),
    hasCheckpointRef: (input) => enclose(hasCheckpointRef(input)),
    diffCheckpoints: (input) => enclose(diffCheckpoints(input)),
    diffContext: (cwd) => enclose(diffContext(cwd)),
    runStackedAction: (input) => enclose(runStackedAction(input)),
    githubAccount: (cwd) => enclose(githubAccount(cwd)),
    publishRepository: (input) => enclose(publishRepository(input)),
  })
})

export const gitRuntimeLayer = Layer.effect(GitRuntime, makeGitRuntime()).pipe(
  Layer.provide(NodeServices.layer),
)
