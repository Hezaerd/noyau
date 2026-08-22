import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import type { VcsRef, VcsStatusResult } from "@noyau/protocol/git"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import {
  ChevronDownIcon,
  FolderGit2Icon,
  FolderIcon,
  GitBranchIcon,
  SearchIcon,
} from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  branchPickerBadge,
  envModeOf,
  resolveBranchSelectionTarget,
  resolveLocalCheckoutBranchMismatch,
  statusLabel,
} from "@/lib/checkout"
import {
  buildCommand,
  dispatchCommand,
  vcsCreateRef,
  vcsListRefs,
  vcsStatus,
  vcsSwitchRef,
} from "@/lib/control-plane"
import { makeThreadMetaUpdateRequest } from "@/lib/thread-commands"

const checkoutTriggerClassName =
  "min-w-0 font-medium text-muted-foreground/70 hover:text-foreground/80"

function CheckoutMenuTrigger({
  disabled,
  children,
}: {
  readonly disabled: boolean
  readonly children: ReactNode
}) {
  return (
    <MenuTrigger
      render={
        <Button
          variant="ghost"
          size="xs"
          disabled={disabled}
          className={checkoutTriggerClassName}
        />
      }
    >
      {children}
    </MenuTrigger>
  )
}

export function ThreadCheckoutBar({
  projectId,
  threadId,
  branch,
  worktreePath,
  disabled,
  envMode,
  envModeLocked,
  onEnvModeChange,
  onBaseBranchChange,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly disabled: boolean
  readonly envMode: ThreadEnvMode
  readonly envModeLocked: boolean
  readonly onEnvModeChange: (mode: ThreadEnvMode) => void
  readonly onBaseBranchChange: (branch: string) => void
}) {
  const [status, setStatus] = useState<VcsStatusResult>()
  const [refs, setRefs] = useState<ReadonlyArray<VcsRef>>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [branchQuery, setBranchQuery] = useState("")
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

  const createBranch = (requestedName?: string) => {
    const name = (requestedName ?? window.prompt("Nom de la branche") ?? "").trim()
    if (name === "") {
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

  const localRefs = refs.filter((ref) => !ref.isRemote)
  const trimmedBranchQuery = branchQuery.trim()
  const filteredRefs =
    trimmedBranchQuery === ""
      ? localRefs
      : localRefs.filter((ref) => ref.name.toLowerCase().includes(trimmedBranchQuery.toLowerCase()))
  const showCreateBranch = trimmedBranchQuery !== "" && filteredRefs.length === 0
  const boundMode = envModeOf({ branch, worktreePath })
  const EnvModeIcon = envMode === "worktree" ? FolderGit2Icon : FolderIcon
  const controlsDisabled = disabled || busy
  const branchLabel = status === undefined ? (branch ?? "…") : statusLabel(status)

  return (
    <div className="flex flex-col gap-1">
      <div
        data-slot="thread-checkout-bar"
        className="mx-6 -mt-px flex items-center gap-1 overflow-x-clip rounded-b-xl border border-t-0 bg-background px-2 py-1 shadow-xs/5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Menu>
            <CheckoutMenuTrigger disabled={controlsDisabled || envModeLocked}>
              <EnvModeIcon data-icon="inline-start" />
              {envMode === "worktree" ? "Worktree" : "Local"}
            </CheckoutMenuTrigger>
            <MenuPopup align="start" side="top">
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
                  <FolderIcon data-icon="inline-start" />
                  Local — WorkspaceRoot
                </MenuItem>
                <MenuItem onClick={() => onEnvModeChange("worktree")}>
                  <FolderGit2Icon data-icon="inline-start" />
                  Worktree — isolé au premier envoi
                </MenuItem>
              </MenuGroup>
            </MenuPopup>
          </Menu>
        </div>
        <Menu
          onOpenChange={(open) => {
            if (!open) {
              setBranchQuery("")
            }
          }}
        >
          <CheckoutMenuTrigger disabled={controlsDisabled}>
            <GitBranchIcon data-icon="inline-start" />
            <span className="min-w-0 max-w-[240px] truncate">{branchLabel}</span>
            <ChevronDownIcon data-icon="inline-end" />
          </CheckoutMenuTrigger>
          <MenuPopup align="end" side="top" className="w-80">
            <div className="px-2 pt-1.5 pb-1">
              <div className="relative border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1.5 left-0 size-4 text-muted-foreground/55"
                />
                <Input
                  unstyled
                  size="sm"
                  type="search"
                  value={branchQuery}
                  placeholder="Rechercher une branche…"
                  aria-label="Rechercher une branche"
                  className="[&_input]:h-6.5 [&_input]:bg-transparent [&_input]:ps-5 [&_input]:font-sans"
                  onKeyDown={(event) => {
                    event.stopPropagation()
                  }}
                  onChange={(event) => {
                    setBranchQuery(event.target.value)
                  }}
                />
              </div>
            </div>
            <MenuGroup>
              <MenuGroupLabel>Branches</MenuGroupLabel>
              {filteredRefs.map((ref) => {
                const badge = branchPickerBadge(ref, status?.cwd ?? "")
                return (
                  <MenuItem key={ref.name} className="w-full" onClick={() => selectRef(ref)}>
                    <span className="flex w-full min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate">{ref.name}</span>
                      {badge === null ? null : (
                        <span className="shrink-0 text-[10px] text-muted-foreground/45">
                          {badge}
                        </span>
                      )}
                    </span>
                  </MenuItem>
                )
              })}
              {filteredRefs.length === 0 && !showCreateBranch ? (
                <p className="px-2 py-1.5 text-muted-foreground text-xs">Aucune branche</p>
              ) : null}
              {showCreateBranch ? (
                <>
                  <MenuSeparator />
                  <MenuItem onClick={() => createBranch(trimmedBranchQuery)}>
                    Créer « {trimmedBranchQuery} »
                  </MenuItem>
                </>
              ) : null}
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
      {notice === undefined ? null : <p className="text-muted-foreground text-xs">{notice}</p>}
    </div>
  )
}
