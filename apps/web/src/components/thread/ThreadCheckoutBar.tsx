import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import type { GitStackedAction, VcsRef, VcsStatusResult } from "@noyau/protocol/git"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { GitBranchIcon, GitCommitHorizontalIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import {
  envModeOf,
  resolveBranchSelectionTarget,
  resolveLocalCheckoutBranchMismatch,
  statusLabel,
} from "@/lib/checkout"
import {
  buildCommand,
  dispatchCommand,
  gitDraft,
  gitRunStackedAction,
  vcsCreateRef,
  vcsListRefs,
  vcsStatus,
  vcsSwitchRef,
} from "@/lib/control-plane"
import { makeGitActionId, makeThreadMetaUpdateRequest } from "@/lib/thread-commands"

const stackedActions: ReadonlyArray<{ readonly value: GitStackedAction; readonly label: string }> =
  [
    { value: "commit", label: "Commit" },
    { value: "push", label: "Push" },
    { value: "create_pr", label: "Créer une PR" },
    { value: "commit_push", label: "Commit + push" },
    { value: "commit_push_pr", label: "Commit + push + PR" },
  ]

export function ThreadCheckoutBar({
  projectId,
  threadId,
  branch,
  worktreePath,
  disabled,
  envMode,
  onEnvModeChange,
  onBaseBranchChange,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly disabled: boolean
  readonly envMode: ThreadEnvMode
  readonly onEnvModeChange: (mode: ThreadEnvMode) => void
  readonly onBaseBranchChange: (branch: string) => void
}) {
  const [status, setStatus] = useState<VcsStatusResult>()
  const [refs, setRefs] = useState<ReadonlyArray<VcsRef>>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [draftTitle, setDraftTitle] = useState("")
  const [draftBody, setDraftBody] = useState("")
  const mismatch = resolveLocalCheckoutBranchMismatch({
    envMode,
    threadBranch: branch,
    liveBranch: status?.refName ?? null,
    worktreePath,
  })

  const scope = threadId === undefined ? { projectId } : { projectId, threadId }

  const refresh = () => {
    void vcsStatus(scope).then((result) => {
      if (result.ok) {
        setStatus(result.value)
      }
      return undefined
    })
    void vcsListRefs(scope).then((result) => {
      if (result.ok) {
        setRefs(result.value.refs)
      }
      return undefined
    })
  }

  useEffect(() => {
    const nextScope = threadId === undefined ? { projectId } : { projectId, threadId }
    void vcsStatus(nextScope).then((result) => {
      if (result.ok) {
        setStatus(result.value)
      }
      return undefined
    })
    void vcsListRefs(nextScope).then((result) => {
      if (result.ok) {
        setRefs(result.value.refs)
      }
      return undefined
    })
  }, [projectId, threadId, worktreePath])

  const bindCheckout = (next: {
    readonly branch?: string | null
    readonly worktreePath?: string | null
  }) => {
    if (threadId === undefined) {
      if (next.branch !== undefined && next.branch !== null) {
        onBaseBranchChange(next.branch)
      }
      return
    }
    void buildCommand(
      makeThreadMetaUpdateRequest(
        Object.assign(
          { threadId },
          next.branch === undefined ? {} : { branch: next.branch },
          next.worktreePath === undefined ? {} : { worktreePath: next.worktreePath },
        ),
      ),
    ).then((built) => {
      if (!built.ok) {
        setNotice(built.failure._tag)
        return undefined
      }
      return dispatchCommand(built.value).then((dispatched) => {
        if (!dispatched.ok) {
          setNotice(dispatched.failure._tag)
        }
        return undefined
      })
    })
  }

  const selectRef = (ref: VcsRef) => {
    const cwd = status?.cwd ?? ""
    const target = resolveBranchSelectionTarget(ref, cwd)
    onBaseBranchChange(ref.isRemote ? ref.name.replace(/^origin\//, "") : ref.name)
    if (target.kind === "reuse") {
      bindCheckout({ branch: ref.name, worktreePath: target.worktreePath })
      return
    }
    if (envMode === "worktree" && worktreePath === null) {
      return
    }
    setBusy(true)
    void vcsSwitchRef({ ...scope, refName: ref.name }).then((result) => {
      setBusy(false)
      if (!result.ok) {
        setNotice(result.failure._tag)
        return undefined
      }
      if (result.value.reusedWorktree && result.value.worktreePath !== null) {
        bindCheckout({ branch: result.value.refName, worktreePath: result.value.worktreePath })
      } else {
        bindCheckout({ branch: result.value.refName, worktreePath: worktreePath })
      }
      refresh()
      return undefined
    })
  }

  const createBranch = () => {
    const name = window.prompt("Nom de la branche")
    if (name === null || name.trim() === "") {
      return
    }
    setBusy(true)
    void vcsCreateRef({ ...scope, refName: name.trim(), switchRef: envMode === "local" }).then(
      (result) => {
        setBusy(false)
        if (!result.ok) {
          setNotice(result.failure._tag)
          return undefined
        }
        onBaseBranchChange(result.value.refName)
        if (envMode === "local") {
          bindCheckout({ branch: result.value.refName, worktreePath: null })
        }
        refresh()
        return undefined
      },
    )
  }

  const generateDraft = (kind: "commit" | "pr") => {
    setBusy(true)
    void gitDraft({ ...scope, kind }).then((result) => {
      setBusy(false)
      if (!result.ok) {
        setNotice(result.failure._tag)
        return undefined
      }
      setDraftTitle(result.value.title)
      setDraftBody(result.value.body ?? "")
      return undefined
    })
  }

  const runAction = (action: GitStackedAction) => {
    setBusy(true)
    const title = draftTitle.trim()
    const body = draftBody.trim()
    void buildCommand(makeGitActionId()).then((built) => {
      if (!built.ok) {
        setBusy(false)
        setNotice(built.failure._tag)
        return undefined
      }
      return gitRunStackedAction(
        Object.assign(
          { ...scope, action, actionId: built.value },
          title === "" ? {} : { commitMessage: title, pullRequestTitle: title },
          body === "" ? {} : { pullRequestBody: body },
        ),
      ).then((result) => {
        setBusy(false)
        if (!result.ok) {
          setNotice(result.failure._tag)
          return undefined
        }
        if (result.value.pullRequest.url !== undefined) {
          setNotice(result.value.pullRequest.url)
        }
        refresh()
        return undefined
      })
    })
  }

  const localRefs = refs.filter((ref) => !ref.isRemote)
  const boundMode = envModeOf({ branch, worktreePath })

  return (
    <div className="flex flex-col gap-2 border-t px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="sm" disabled={disabled || busy} />}>
            <GitBranchIcon data-icon="inline-start" />
            {envMode === "worktree" ? "Worktree" : "Local"}
          </MenuTrigger>
          <MenuPopup>
            <MenuGroup>
              <MenuGroupLabel>Checkout</MenuGroupLabel>
              <MenuItem
                onClick={() => {
                  onEnvModeChange("local")
                  if (boundMode === "worktree") {
                    bindCheckout({ branch: status?.refName ?? branch, worktreePath: null })
                  }
                }}
              >
                Local — WorkspaceRoot
              </MenuItem>
              <MenuItem onClick={() => onEnvModeChange("worktree")}>
                Worktree — isolé au premier envoi
              </MenuItem>
            </MenuGroup>
          </MenuPopup>
        </Menu>
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="sm" disabled={disabled || busy} />}>
            {statusLabel(status)}
          </MenuTrigger>
          <MenuPopup className="max-h-72 overflow-y-auto">
            <MenuGroup>
              <MenuGroupLabel>Branches</MenuGroupLabel>
              {localRefs.map((ref) => (
                <MenuItem key={ref.name} onClick={() => selectRef(ref)}>
                  {ref.current ? "• " : ""}
                  {ref.name}
                  {ref.worktreePath !== null ? " · worktree" : ""}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onClick={createBranch}>Nouvelle branche…</MenuItem>
            </MenuGroup>
          </MenuPopup>
        </Menu>
        <Menu>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || busy || status?.isRepo !== true}
              />
            }
          >
            <GitCommitHorizontalIcon data-icon="inline-start" />
            Git
          </MenuTrigger>
          <MenuPopup>
            <MenuGroup>
              <MenuGroupLabel>Brouillon</MenuGroupLabel>
              <MenuItem onClick={() => generateDraft("commit")}>
                Générer le message de commit
              </MenuItem>
              <MenuItem onClick={() => generateDraft("pr")}>Générer le texte de PR</MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Actions</MenuGroupLabel>
              {stackedActions.map((action) => (
                <MenuItem key={action.value} onClick={() => runAction(action.value)}>
                  {action.label}
                </MenuItem>
              ))}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>
      {mismatch !== null ? (
        <Alert variant="warning">
          <AlertTitle>Branche différente</AlertTitle>
          <AlertDescription>
            Ce Thread a tourné sur {mismatch.previous}. L&apos;envoi continue sur {mismatch.current}
            . Restaure avec le sélecteur de branche.
          </AlertDescription>
        </Alert>
      ) : null}
      {draftTitle !== "" ? (
        <p className="text-muted-foreground text-xs">
          Brouillon : {draftTitle}
          {draftBody === "" ? "" : ` — ${draftBody}`}
        </p>
      ) : null}
      {notice === undefined ? null : <p className="text-muted-foreground text-xs">{notice}</p>}
    </div>
  )
}
