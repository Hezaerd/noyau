import type { GitStackedAction, VcsStatusResult } from "@noyau/contracts/git"

export type GitActionIconName = "commit" | "push" | "pr" | "publish"

export type GitDialogAction = "commit" | "create_pr"

export interface GitActionMenuItem {
  readonly id: "commit" | "push" | "pr" | "publish"
  readonly label: string
  readonly disabled: boolean
  readonly icon: GitActionIconName
  readonly kind: "open_dialog" | "run_action" | "open_publish"
  readonly action?: GitStackedAction
  readonly dialogAction?: GitDialogAction
}

export interface GitQuickAction {
  readonly label: string
  readonly disabled: boolean
  readonly kind: "run_action" | "open_dialog" | "show_hint" | "open_publish"
  readonly action?: GitStackedAction
  readonly hint?: string
}

export const suggestPublishRepository = (cwd: string, login: string | null): string => {
  const slug =
    cwd
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1)
      ?.trim() || "repo"
  return login === null || login === "" ? slug : `${login}/${slug}`
}

export const actionNeedsCommit = (action: GitStackedAction): boolean =>
  action === "commit" || action === "commit_push" || action === "commit_push_pr"

export const actionNeedsPullRequest = (action: GitStackedAction): boolean =>
  action === "create_pr" || action === "commit_push_pr"

export const actionNeedsDialog = (action: GitStackedAction): boolean =>
  actionNeedsCommit(action) || actionNeedsPullRequest(action)

export const requiresDefaultBranchConfirmation = (
  action: GitStackedAction,
  isDefaultRef: boolean,
): boolean => {
  if (!isDefaultRef) {
    return false
  }
  return (
    action === "push" ||
    action === "create_pr" ||
    action === "commit_push" ||
    action === "commit_push_pr"
  )
}

export interface DefaultBranchActionCopy {
  readonly title: string
  readonly description: string
  readonly continueLabel: string
}

export const resolveDefaultBranchActionCopy = (input: {
  readonly action: GitStackedAction
  readonly branchName: string
  readonly includesCommit: boolean
}): DefaultBranchActionCopy => {
  const suffix = ` on "${input.branchName}".`
  if (input.action === "push" || input.action === "commit_push") {
    if (input.includesCommit) {
      return {
        title: "Commit & push to the default branch?",
        description: `This will commit and push the changes${suffix}`,
        continueLabel: `Commit & push to ${input.branchName}`,
      }
    }
    return {
      title: "Push to the default branch?",
      description: `This will push local commits${suffix}`,
      continueLabel: `Push to ${input.branchName}`,
    }
  }
  if (input.includesCommit) {
    return {
      title: "Commit, push & PR from the default branch?",
      description: `This will commit, push, and open a PR${suffix}`,
      continueLabel: "Commit, push & create a PR",
    }
  }
  return {
    title: "PR from the default branch?",
    description: `This will push local commits and open a PR${suffix}`,
    continueLabel: "Create a PR",
  }
}

export const buildMenuItems = (
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
): ReadonlyArray<GitActionMenuItem> => {
  if (gitStatus === null || !gitStatus.isRepo) {
    return []
  }
  const hasBranch = gitStatus.refName !== null
  const hasChanges = gitStatus.hasWorkingTreeChanges
  const isBehind = gitStatus.behindCount > 0
  const hasOpenPr = gitStatus.pr?.state === "open"
  const canPushWithoutUpstream = gitStatus.hasPrimaryRemote && !gitStatus.hasUpstream
  const canCommit = !isBusy && hasChanges
  const canPush =
    !isBusy &&
    hasBranch &&
    !isBehind &&
    gitStatus.aheadCount > 0 &&
    (gitStatus.hasUpstream || canPushWithoutUpstream)
  const canCreatePr =
    !isBusy &&
    hasBranch &&
    !hasChanges &&
    !isBehind &&
    !hasOpenPr &&
    gitStatus.hasPrimaryRemote &&
    (gitStatus.aheadCount > 0 || (!gitStatus.isDefaultRef && gitStatus.hasUpstream))

  const items: Array<GitActionMenuItem> = [
    {
      id: "commit",
      label: "Commit",
      disabled: !canCommit,
      icon: "commit",
      kind: "open_dialog",
      action: "commit",
      dialogAction: "commit",
    },
  ]
  if (!gitStatus.hasPrimaryRemote) {
    items.push({
      id: "publish",
      label: "Create the repo",
      disabled: isBusy,
      icon: "publish",
      kind: "open_publish",
    })
    return items
  }
  items.push(
    {
      id: "push",
      label: "Push",
      disabled: !canPush,
      icon: "push",
      kind: "run_action",
      action: "push",
    },
    {
      id: "pr",
      label: "Create a PR",
      disabled: !canCreatePr,
      icon: "pr",
      kind: "open_dialog",
      action: "create_pr",
      dialogAction: "create_pr",
    },
  )
  return items
}

export const resolveQuickAction = (
  gitStatus: VcsStatusResult | null,
  isBusy: boolean,
): GitQuickAction => {
  if (isBusy) {
    return { label: "Commit", disabled: true, kind: "show_hint", hint: "Git action in progress." }
  }
  if (gitStatus === null || !gitStatus.isRepo) {
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "Git status unavailable.",
    }
  }
  const hasChanges = gitStatus.hasWorkingTreeChanges

  if (!gitStatus.hasPrimaryRemote) {
    if (hasChanges) {
      return { label: "Commit", disabled: false, kind: "open_dialog", action: "commit" }
    }
    return { label: "Create the repo", disabled: false, kind: "open_publish" }
  }

  if (gitStatus.refName === null) {
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "Create and check out a branch before pushing or opening a PR.",
    }
  }

  const isAhead = gitStatus.aheadCount > 0
  const isBehind = gitStatus.behindCount > 0
  const isDefaultRef = gitStatus.isDefaultRef
  const hasOpenPr = gitStatus.pr?.state === "open"

  if (hasChanges) {
    if (isDefaultRef || hasOpenPr) {
      return { label: "Commit & push", disabled: false, kind: "open_dialog", action: "commit_push" }
    }
    return {
      label: "Commit, push & PR",
      disabled: false,
      kind: "open_dialog",
      action: "commit_push_pr",
    }
  }

  if (!gitStatus.hasUpstream && !isAhead) {
    return {
      label: "Push",
      disabled: true,
      kind: "show_hint",
      hint: "No local commits to push.",
    }
  }

  if (isAhead && isBehind) {
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "The branch has diverged. Rebase or merge first.",
    }
  }

  if (isBehind) {
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "The branch is behind. Rebase or merge first.",
    }
  }

  if (isAhead) {
    if (isDefaultRef || hasOpenPr) {
      return { label: "Push", disabled: false, kind: "run_action", action: "push" }
    }
    return {
      label: "Push & create a PR",
      disabled: false,
      kind: "open_dialog",
      action: "create_pr",
    }
  }

  if (!isDefaultRef && gitStatus.hasUpstream && !hasOpenPr) {
    return {
      label: "Create a PR",
      disabled: false,
      kind: "open_dialog",
      action: "create_pr",
    }
  }

  return {
    label: "Commit",
    disabled: true,
    kind: "show_hint",
    hint: "Branch is up to date. Nothing to do.",
  }
}
