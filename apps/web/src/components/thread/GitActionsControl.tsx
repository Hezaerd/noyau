import type {
  GitPublishRepositoryResult,
  GitRepositoryVisibility,
  GitStackedAction,
} from "@noyau/protocol/git"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { Crypto, Effect } from "effect"
import {
  ChevronDownIcon,
  CloudUploadIcon,
  GitCommitIcon,
  GitPullRequestIcon,
  GlobeIcon,
  LockIcon,
} from "lucide-react"
import { useState } from "react"

import { ThreadPullRequestBadge } from "@/components/thread/ThreadPullRequestBadge"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Group, GroupSeparator } from "@/components/ui/group"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import { Textarea } from "@/components/ui/textarea"
import { toastManager } from "@/components/ui/toast"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useVcsStatus } from "@/hooks/use-vcs-status"
import {
  buildCommand,
  gitDraft,
  gitGithubAccount,
  gitPublishRepository,
  gitRunStackedAction,
} from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import {
  actionNeedsCommit,
  actionNeedsDialog,
  actionNeedsPullRequest,
  buildMenuItems,
  requiresDefaultBranchConfirmation,
  resolveDefaultBranchActionCopy,
  resolveQuickAction,
  suggestPublishRepository,
  type GitActionIconName,
  type GitQuickAction,
} from "@/lib/git-actions"
import { displayedThreadPr } from "@/lib/vcs-status"

interface GitStackedDrafts {
  commitMessage?: string
  pullRequestTitle?: string
  pullRequestBody?: string
}

const nextActionId = () =>
  buildCommand(
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      return yield* crypto.randomUUIDv4
    }),
  )

const GitActionIcon = ({
  icon,
}: {
  readonly icon: GitActionIconName | GitQuickAction["action"]
}) => {
  if (icon === "publish" || icon === "push" || icon === "commit_push") {
    return <CloudUploadIcon />
  }
  if (icon === "pr" || icon === "create_pr" || icon === "commit_push_pr") {
    return <GitPullRequestIcon />
  }
  return <GitCommitIcon />
}

const reportGitFailure = (failure: Parameters<typeof presentFailure>[0]) => {
  showFailureToast(
    presentFailure(failure, {
      operation: "thread.git.action",
      scope: "project",
      initiatedByUser: true,
      hasUsableData: true,
    }),
  )
}

const toastStackedResult = (action: GitStackedAction, url?: string) => {
  const title =
    action === "commit"
      ? "Commit créé"
      : action === "push" || action === "commit_push"
        ? "Push effectué"
        : "PR ouverte"
  toastManager.add(
    url === undefined
      ? { type: "success", title }
      : {
          type: "success",
          title,
          actionProps: {
            children: "Ouvrir",
            onClick: () => {
              window.open(url, "_blank", "noopener,noreferrer")
            },
          },
        },
  )
  if (url !== undefined) {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}

const toastPublishResult = (result: GitPublishRepositoryResult) => {
  toastManager.add({
    type: "success",
    title: result.status === "pushed" ? "Repo créé et poussé" : "Repo créé",
    description:
      result.status === "pushed"
        ? result.nameWithOwner
        : `${result.nameWithOwner} — origin câblé, rien à pousser.`,
    actionProps: {
      children: "Ouvrir",
      onClick: () => {
        window.open(result.url, "_blank", "noopener,noreferrer")
      },
    },
  })
  window.open(result.url, "_blank", "noopener,noreferrer")
}

export function GitActionsControl({
  projectId,
  threadId,
  branch,
  worktreePath,
  disabled,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly disabled: boolean
}) {
  const scope = threadId === undefined ? { projectId } : { projectId, threadId }
  const status = useVcsStatus(scope)
  const [busy, setBusy] = useState(false)
  const [dialogAction, setDialogAction] = useState<GitStackedAction>()
  const [commitMessage, setCommitMessage] = useState("")
  const [pullRequestTitle, setPullRequestTitle] = useState("")
  const [pullRequestBody, setPullRequestBody] = useState("")
  const [drafting, setDrafting] = useState(false)
  const [pendingDefault, setPendingDefault] = useState<{
    readonly action: GitStackedAction
    readonly copy: ReturnType<typeof resolveDefaultBranchActionCopy>
  }>()
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishRepository, setPublishRepository] = useState("")
  const [publishVisibility, setPublishVisibility] = useState<GitRepositoryVisibility>("private")

  const quickAction = resolveQuickAction(status, busy || disabled)
  const menuItems = buildMenuItems(status, busy || disabled)
  const displayedPr = displayedThreadPr({
    thread: { branch, worktreePath },
    gitStatus: status,
    snapshot: undefined,
  })

  const closeDialog = () => {
    setDialogAction(undefined)
    setCommitMessage("")
    setPullRequestTitle("")
    setPullRequestBody("")
    setDrafting(false)
  }

  const runAction = (action: GitStackedAction, drafts?: GitStackedDrafts) => {
    setBusy(true)
    void nextActionId().then((built) => {
      if (!built.ok) {
        setBusy(false)
        reportGitFailure(built.failure)
        return undefined
      }
      const input = { ...scope, action, actionId: built.value }
      if (drafts?.commitMessage !== undefined) {
        Object.assign(input, { commitMessage: drafts.commitMessage })
      }
      if (drafts?.pullRequestTitle !== undefined) {
        Object.assign(input, { pullRequestTitle: drafts.pullRequestTitle })
      }
      if (drafts?.pullRequestBody !== undefined) {
        Object.assign(input, { pullRequestBody: drafts.pullRequestBody })
      }
      return gitRunStackedAction(input).then((result) => {
        setBusy(false)
        if (!result.ok) {
          reportGitFailure(result.failure)
          return undefined
        }
        toastStackedResult(action, result.value.pullRequest.url)
        return undefined
      })
    })
  }

  const openDialog = (action: GitStackedAction) => {
    setDialogAction(action)
    setDrafting(true)
    const drafts = [
      actionNeedsCommit(action)
        ? gitDraft({ ...scope, kind: "commit" }).then((result) => {
            if (result.ok) {
              setCommitMessage(result.value.title)
            }
            return undefined
          })
        : Promise.resolve(),
      actionNeedsPullRequest(action)
        ? gitDraft({ ...scope, kind: "pr" }).then((result) => {
            if (result.ok) {
              setPullRequestTitle(result.value.title)
              setPullRequestBody(result.value.body ?? "")
            }
            return undefined
          })
        : Promise.resolve(),
    ]
    void Promise.all(drafts).finally(() => {
      setDrafting(false)
    })
  }

  const requestAction = (action: GitStackedAction) => {
    const isDefaultRef = status?.isDefaultRef === true
    if (requiresDefaultBranchConfirmation(action, isDefaultRef)) {
      setPendingDefault({
        action,
        copy: resolveDefaultBranchActionCopy({
          action,
          branchName: status?.refName ?? "default",
          includesCommit: actionNeedsCommit(action),
        }),
      })
      return
    }
    if (actionNeedsDialog(action)) {
      openDialog(action)
      return
    }
    runAction(action)
  }

  const confirmDialog = () => {
    if (dialogAction === undefined) {
      return
    }
    const trimmedCommit = commitMessage.trim()
    const trimmedTitle = pullRequestTitle.trim()
    if (actionNeedsCommit(dialogAction) && trimmedCommit === "") {
      return
    }
    if (actionNeedsPullRequest(dialogAction) && trimmedTitle === "") {
      return
    }
    const action = dialogAction
    closeDialog()
    const drafts: GitStackedDrafts = {}
    if (actionNeedsCommit(action)) {
      drafts.commitMessage = trimmedCommit
    }
    if (actionNeedsPullRequest(action)) {
      drafts.pullRequestTitle = trimmedTitle
      const body = pullRequestBody.trim()
      if (body !== "") {
        drafts.pullRequestBody = body
      }
    }
    runAction(action, drafts)
  }

  const confirmDefault = () => {
    const pending = pendingDefault
    setPendingDefault(undefined)
    if (pending === undefined) {
      return
    }
    if (actionNeedsDialog(pending.action)) {
      openDialog(pending.action)
      return
    }
    runAction(pending.action)
  }

  const openPublish = () => {
    setPublishVisibility("private")
    setPublishRepository(suggestPublishRepository(status?.cwd ?? "", null))
    setPublishOpen(true)
    void gitGithubAccount(scope).then((result) => {
      const login = result.ok ? result.value.login : null
      setPublishRepository((current) => {
        const suggested = suggestPublishRepository(status?.cwd ?? "", login)
        return current === "" || current === suggestPublishRepository(status?.cwd ?? "", null)
          ? suggested
          : current
      })
      return undefined
    })
  }

  const confirmPublish = () => {
    const repository = publishRepository.trim()
    if (repository === "") {
      return
    }
    setPublishOpen(false)
    setBusy(true)
    void gitPublishRepository({ ...scope, repository, visibility: publishVisibility }).then(
      (result) => {
        setBusy(false)
        if (!result.ok) {
          reportGitFailure(result.failure)
          return undefined
        }
        toastPublishResult(result.value)
        return undefined
      },
    )
  }

  if (status !== null && !status.isRepo) {
    return null
  }

  const primaryButton = (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="no-drag ps-[8.5px]"
      disabled={quickAction.disabled || busy}
      onClick={() => {
        if (quickAction.kind === "open_publish") {
          openPublish()
          return
        }
        if (quickAction.action !== undefined) {
          requestAction(quickAction.action)
        }
      }}
    >
      <GitActionIcon
        icon={quickAction.kind === "open_publish" ? "publish" : (quickAction.action ?? "commit")}
      />
      <span className="hidden @3xl/header-actions:inline">{quickAction.label}</span>
    </Button>
  )

  return (
    <>
      {displayedPr === null ? null : <ThreadPullRequestBadge pr={displayedPr} />}
      <Group aria-label="Git actions" className="shrink-0">
        {quickAction.kind === "show_hint" ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="no-drag ps-[8.5px]"
                  disabled
                  aria-label={quickAction.label}
                />
              }
            >
              <GitActionIcon icon="commit" />
              <span className="hidden @3xl/header-actions:inline">{quickAction.label}</span>
            </TooltipTrigger>
            <TooltipPopup side="bottom">{quickAction.hint}</TooltipPopup>
          </Tooltip>
        ) : (
          primaryButton
        )}
        <GroupSeparator className="hidden @3xl/header-actions:block" />
        <Menu>
          <MenuTrigger
            render={
              <Button
                type="button"
                size="icon-xs"
                variant="outline"
                className="no-drag"
                aria-label="Options Git"
                disabled={busy || disabled}
              />
            }
          >
            <ChevronDownIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            {menuItems.map((item) => (
              <MenuItem
                key={item.id}
                disabled={item.disabled}
                onClick={() => {
                  if (item.kind === "open_publish") {
                    openPublish()
                    return
                  }
                  if (item.action !== undefined) {
                    requestAction(item.action)
                  }
                }}
              >
                <GitActionIcon icon={item.icon} />
                {item.label}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      </Group>

      <Dialog
        open={dialogAction !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog()
          }
        }}
      >
        <DialogPopup className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogAction !== undefined && actionNeedsPullRequest(dialogAction)
                ? "Créer une PR"
                : "Commit"}
            </DialogTitle>
            <DialogDescription>
              {drafting
                ? "Draft Git en cours…"
                : "Vérifie le texte généré avant de lancer l’action empilée."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            {dialogAction !== undefined && actionNeedsCommit(dialogAction) ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="git-commit-message">Message de commit</Label>
                <Textarea
                  id="git-commit-message"
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                />
              </div>
            ) : null}
            {dialogAction !== undefined && actionNeedsPullRequest(dialogAction) ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="git-pr-title">Titre de la PR</Label>
                  <Input
                    id="git-pr-title"
                    value={pullRequestTitle}
                    onChange={(event) => setPullRequestTitle(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="git-pr-body">Description</Label>
                  <Textarea
                    id="git-pr-body"
                    value={pullRequestBody}
                    onChange={(event) => setPullRequestBody(event.target.value)}
                  />
                </div>
              </>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={
                drafting ||
                (dialogAction !== undefined &&
                  actionNeedsCommit(dialogAction) &&
                  commitMessage.trim() === "") ||
                (dialogAction !== undefined &&
                  actionNeedsPullRequest(dialogAction) &&
                  pullRequestTitle.trim() === "")
              }
              onClick={confirmDialog}
            >
              {dialogAction === "commit"
                ? "Commit"
                : dialogAction === "create_pr"
                  ? "Créer la PR"
                  : "Lancer"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={publishOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPublishOpen(false)
          }
        }}
      >
        <DialogPopup className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Créer le repo</DialogTitle>
            <DialogDescription>
              Crée un dépôt GitHub, câble origin, puis pousse HEAD s’il existe.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="git-publish-repository">Dépôt</Label>
              <Input
                id="git-publish-repository"
                value={publishRepository}
                onChange={(event) => setPublishRepository(event.target.value)}
                placeholder="owner/repo"
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Visibilité</span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={publishVisibility === "private" ? "default" : "outline"}
                  onClick={() => setPublishVisibility("private")}
                >
                  <LockIcon />
                  Privé
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={publishVisibility === "public" ? "default" : "outline"}
                  onClick={() => setPublishVisibility("public")}
                >
                  <GlobeIcon />
                  Public
                </Button>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPublishOpen(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={busy || publishRepository.trim() === ""}
              onClick={confirmPublish}
            >
              Créer le repo
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={pendingDefault !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDefault(undefined)
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDefault?.copy.title}</AlertDialogTitle>
            <AlertDialogDescription>{pendingDefault?.copy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" variant="ghost" />}>
              Annuler
            </AlertDialogClose>
            <AlertDialogClose render={<Button type="button" />} onClick={confirmDefault}>
              {pendingDefault?.copy.continueLabel}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}
