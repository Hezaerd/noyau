import type { ThreadEnvMode } from "@noyau/contracts/entities/checkout"
import type { VcsRef } from "@noyau/contracts/git"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import {
  ChevronDownIcon,
  FolderGit2Icon,
  FolderIcon,
  GitBranchIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"
import { useEffect, useId, useState, type ReactNode } from "react"

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
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useVcsStatus } from "@/hooks/use-vcs-status"
import {
  branchPickerBadge,
  isRemovableWorktreeRef,
  isSelectingWorktreeBase,
  isWorktreeDeleteGesture,
  resolveBranchSelectionTarget,
  resolveBranchTriggerLabel,
  resolveEnvModeLabel,
  resolveEnvModeTriggerLabel,
  resolveLocalCheckoutBranchMismatch,
  resolveWorktreeBaseBranch,
} from "@/lib/checkout"
import { composerOverlayGlassClassName } from "@/lib/composer-glass"
import {
  buildCommand,
  dispatchCommand,
  vcsCreateRef,
  vcsListRefs,
  vcsSwitchRef,
} from "@/lib/control-plane"
import { makeThreadMetaUpdateRequest } from "@/lib/thread-commands"
import { cn } from "@/lib/utils"
import { releaseWorktree } from "@/lib/worktree-cleanup"

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
  startFromOrigin,
  onEnvModeChange,
  onBaseBranchChange,
  onStartFromOriginChange,
}: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly disabled: boolean
  readonly envMode: ThreadEnvMode
  readonly envModeLocked: boolean
  readonly startFromOrigin: boolean
  readonly onEnvModeChange: (mode: ThreadEnvMode) => void
  readonly onBaseBranchChange: (branch: string) => void
  readonly onStartFromOriginChange: (startFromOrigin: boolean) => void
}) {
  const startFromOriginSwitchId = useId()
  const scope = threadId === undefined ? { projectId } : { projectId, threadId }
  const status = useVcsStatus(scope) ?? undefined
  const [refs, setRefs] = useState<ReadonlyArray<VcsRef>>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [branchQuery, setBranchQuery] = useState("")
  const selectingWorktreeBase = isSelectingWorktreeBase({ envMode, worktreePath })
  const mismatch = resolveLocalCheckoutBranchMismatch({
    envMode,
    threadBranch: branch,
    liveBranch: status?.refName ?? null,
    worktreePath,
  })

  const refreshRefs = () => {
    void vcsListRefs(scope).then((result) => {
      if (result.ok) {
        setRefs(result.value.refs)
      }
      return undefined
    })
  }

  useEffect(() => {
    const nextScope = threadId === undefined ? { projectId } : { projectId, threadId }
    void vcsListRefs(nextScope).then((result) => {
      if (result.ok) {
        setRefs(result.value.refs)
      }
      return undefined
    })
  }, [projectId, threadId, worktreePath])

  useEffect(() => {
    if (branch !== null && branch !== "") {
      return
    }
    if (selectingWorktreeBase) {
      const candidate = resolveWorktreeBaseBranch({
        refs,
        currentBranch: status?.refName ?? null,
      })
      if (candidate !== null) {
        onBaseBranchChange(candidate)
      }
      return
    }
    if (envMode === "local" && status?.refName != null) {
      onBaseBranchChange(status.refName)
    }
  }, [branch, envMode, onBaseBranchChange, refs, selectingWorktreeBase, status?.refName])

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
    const localName = ref.isRemote ? ref.name.replace(/^origin\//, "") : ref.name
    onBaseBranchChange(localName)
    if (selectingWorktreeBase) {
      if (threadId !== undefined) {
        bindCheckout({ branch: ref.name })
      }
      return
    }
    const cwd = status?.cwd ?? ""
    const target = resolveBranchSelectionTarget(ref, cwd)
    if (target.kind === "reuse") {
      onEnvModeChange("worktree")
      bindCheckout({ branch: ref.name, worktreePath: target.worktreePath })
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
        onEnvModeChange("worktree")
        bindCheckout({ branch: result.value.refName, worktreePath: result.value.worktreePath })
      } else {
        bindCheckout({ branch: result.value.refName, worktreePath: worktreePath })
      }
      refreshRefs()
      return undefined
    })
  }

  const removeListedWorktree = (ref: VcsRef) => {
    const path = ref.worktreePath
    if (path === null) {
      return
    }
    setBusy(true)
    void releaseWorktree({
      projectId,
      path,
      unbindThreadIds: threadId !== undefined && worktreePath === path ? [threadId] : [],
    }).then((result) => {
      setBusy(false)
      if (!result.ok) {
        setNotice(result.failure._tag)
        return undefined
      }
      if (worktreePath === path) {
        onEnvModeChange("local")
        if (threadId !== undefined) {
          bindCheckout({ worktreePath: null })
        }
      }
      refreshRefs()
      return undefined
    })
  }

  const createBranch = (requestedName?: string) => {
    const name = (requestedName ?? window.prompt("Nom de la branche") ?? "").trim()
    if (name === "" || selectingWorktreeBase) {
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
        refreshRefs()
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
  const showCreateBranch =
    !selectingWorktreeBase && trimmedBranchQuery !== "" && filteredRefs.length === 0
  const EnvModeIcon = envMode === "worktree" ? FolderGit2Icon : FolderIcon
  const controlsDisabled = disabled || busy
  const branchLabel = resolveBranchTriggerLabel({
    envMode,
    worktreePath,
    baseBranch: branch,
    liveBranch: status?.refName ?? null,
    startFromOrigin,
    status,
  })

  return (
    <div className="flex flex-col gap-1">
      <div
        data-slot="thread-checkout-bar"
        className="composer-context-strip mx-6 -mt-px flex items-center gap-1 overflow-x-clip rounded-b-xl px-2 py-1"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Menu>
            <CheckoutMenuTrigger disabled={controlsDisabled || envModeLocked}>
              <EnvModeIcon data-icon="inline-start" />
              {resolveEnvModeTriggerLabel({ envMode, worktreePath, locked: envModeLocked })}
            </CheckoutMenuTrigger>
            <MenuPopup align="start" side="top" className={composerOverlayGlassClassName}>
              <MenuGroup>
                <MenuGroupLabel>Checkout</MenuGroupLabel>
                <MenuItem
                  onClick={() => {
                    onEnvModeChange("local")
                    if (worktreePath !== null) {
                      bindCheckout({ branch: status?.refName ?? branch, worktreePath: null })
                    }
                  }}
                >
                  <FolderIcon data-icon="inline-start" />
                  {resolveEnvModeLabel("local")}
                </MenuItem>
                <MenuItem onClick={() => onEnvModeChange("worktree")}>
                  <FolderGit2Icon data-icon="inline-start" />
                  {resolveEnvModeLabel("worktree")}
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
          <MenuPopup align="end" side="top" className={cn("w-80", composerOverlayGlassClassName)}>
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
                const cwd = status?.cwd ?? ""
                const badge = branchPickerBadge(ref, cwd)
                const removable = isRemovableWorktreeRef(ref, cwd, status?.worktreePath ?? null)
                return (
                  <MenuItem
                    key={ref.name}
                    className="w-full"
                    title={removable ? "⌘⇧ clic pour supprimer le worktree" : undefined}
                    onClick={(event) => {
                      if (isWorktreeDeleteGesture(event) && removable) {
                        event.preventDefault()
                        removeListedWorktree(ref)
                        return
                      }
                      selectRef(ref)
                    }}
                  >
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
            {selectingWorktreeBase ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <label
                      htmlFor={startFromOriginSwitchId}
                      className="flex cursor-pointer items-center justify-between gap-3 border-t border-border/60 px-3 py-2 text-xs"
                      onClick={(event) => {
                        event.stopPropagation()
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1.5 font-medium text-muted-foreground">
                        <RefreshCwIcon aria-hidden="true" className="size-3 shrink-0 opacity-70" />
                        <span className="truncate">Partir de origin</span>
                      </span>
                      <Switch
                        id={startFromOriginSwitchId}
                        checked={startFromOrigin}
                        className="[--thumb-size:--spacing(3.5)]"
                        aria-label="Créer le worktree depuis origin"
                        onCheckedChange={(checked) => onStartFromOriginChange(checked)}
                      />
                    </label>
                  }
                />
                <TooltipPopup
                  side="top"
                  className={cn(
                    "max-w-72 whitespace-normal leading-tight",
                    composerOverlayGlassClassName,
                  )}
                >
                  Crée le worktree depuis la branche correspondante sur origin, pas depuis le
                  checkout local.
                </TooltipPopup>
              </Tooltip>
            ) : null}
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
