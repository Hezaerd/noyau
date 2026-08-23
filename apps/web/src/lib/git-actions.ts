import type { GitStackedAction, VcsStatusResult } from "@noyau/protocol/git"

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
  const suffix = ` sur « ${input.branchName} ».`
  if (input.action === "push" || input.action === "commit_push") {
    if (input.includesCommit) {
      return {
        title: "Commit & push sur la branche par défaut ?",
        description: `Ça va committer et pousser les changements${suffix}`,
        continueLabel: `Commit & push sur ${input.branchName}`,
      }
    }
    return {
      title: "Push sur la branche par défaut ?",
      description: `Ça va pousser les commits locaux${suffix}`,
      continueLabel: `Push sur ${input.branchName}`,
    }
  }
  if (input.includesCommit) {
    return {
      title: "Commit, push & PR depuis la branche par défaut ?",
      description: `Ça va committer, pousser et ouvrir une PR${suffix}`,
      continueLabel: "Commit, push & créer une PR",
    }
  }
  return {
    title: "PR depuis la branche par défaut ?",
    description: `Ça va pousser les commits locaux et ouvrir une PR${suffix}`,
    continueLabel: "Créer une PR",
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
      label: "Créer le repo",
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
      label: "Créer une PR",
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
    return { label: "Commit", disabled: true, kind: "show_hint", hint: "Action Git en cours." }
  }
  if (gitStatus === null || !gitStatus.isRepo) {
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "Git status indisponible.",
    }
  }
  const hasChanges = gitStatus.hasWorkingTreeChanges

  if (!gitStatus.hasPrimaryRemote) {
    if (hasChanges) {
      return { label: "Commit", disabled: false, kind: "open_dialog", action: "commit" }
    }
    return { label: "Créer le repo", disabled: false, kind: "open_publish" }
  }

  if (gitStatus.refName === null) {
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "Crée et checkout une branche avant de pousser ou d’ouvrir une PR.",
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
      hint: "Aucun commit local à pousser.",
    }
  }

  if (isAhead && isBehind) {
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "La branche a divergé. Rebase ou merge d’abord.",
    }
  }

  if (isBehind) {
    return {
      label: "Commit",
      disabled: true,
      kind: "show_hint",
      hint: "La branche est en retard. Rebase ou merge d’abord.",
    }
  }

  if (isAhead) {
    if (isDefaultRef || hasOpenPr) {
      return { label: "Push", disabled: false, kind: "run_action", action: "push" }
    }
    return {
      label: "Push & créer une PR",
      disabled: false,
      kind: "open_dialog",
      action: "create_pr",
    }
  }

  if (!isDefaultRef && gitStatus.hasUpstream && !hasOpenPr) {
    return {
      label: "Créer une PR",
      disabled: false,
      kind: "open_dialog",
      action: "create_pr",
    }
  }

  return {
    label: "Commit",
    disabled: true,
    kind: "show_hint",
    hint: "Branche à jour. Rien à faire.",
  }
}
