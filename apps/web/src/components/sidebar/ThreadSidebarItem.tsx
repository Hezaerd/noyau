import { threadBranchOf, threadWorktreePathOf } from "@noyau/contracts/entities/checkout"
import type { VcsStatusPullRequest } from "@noyau/contracts/git"
import type { ProjectShell, ThreadShell } from "@noyau/contracts/shell"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CircleCheckIcon,
  CircleDotIcon,
  FolderGit2Icon,
  FolderIcon,
  GitBranchIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { memo, useEffect, useRef, useState } from "react"

import { ThreadDeleteConfirmDialog } from "@/components/sidebar/ThreadDeleteConfirmDialog"
import { ThreadSidebarPopover } from "@/components/sidebar/ThreadSidebarPopover"
import { ThreadSidebarStatus } from "@/components/sidebar/ThreadSidebarStatus"
import { LiveElapsed } from "@/components/thread/LiveElapsed"
import { ThreadPullRequestBadge } from "@/components/thread/ThreadPullRequestBadge"
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { useProviders } from "@/hooks/use-control-plane"
import { useKeybinding } from "@/hooks/use-keybindings"
import { useThreadActivity } from "@/hooks/use-sidebar-queues"
import { useThreadPinned } from "@/hooks/use-thread-pins"
import { resolveSidebarCheckoutBranch } from "@/lib/checkout"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import { providerInstanceIconOf } from "@/lib/provider-presentation"
import {
  formatAgoCompactLabel,
  resolveSidebarLastActivityAtMs,
  resolveWorkingStartedAtMs,
  type ThreadActivity,
} from "@/lib/thread-activity"
import { makeThreadDeleteRequest, makeThreadMetaUpdateRequest } from "@/lib/thread-commands"
import { dispatchThreadSettle } from "@/lib/thread-settle-actions"
import { canSettle } from "@/lib/thread-settled"
import { prefetchThreadSnapshot } from "@/lib/thread-snapshot-prefetch"
import { dispatchThreadTitleRegenerate } from "@/lib/thread-title-actions"
import { cn } from "@/lib/utils"
import { openWorkspacePullRequest } from "@/lib/workspace-pr"
import { toggleThreadPinned } from "@/state/thread-pins"

export const ThreadSidebarItem = memo(function ThreadSidebarItem({
  thread,
  project,
  pullRequest,
  liveBranch,
  isActive,
  settled,
  onSelect,
}: {
  readonly thread: ThreadShell
  readonly project: Pick<ProjectShell, "id" | "name" | "workspaceRoot">
  readonly pullRequest: VcsStatusPullRequest | null
  readonly liveBranch: string | null
  readonly isActive: boolean
  readonly settled: boolean
  readonly onSelect: () => void
}) {
  const navigate = useNavigate()
  const renameHotkey = useKeybinding("thread.rename")
  const pinHotkey = useKeybinding("thread.pin")
  const settleHotkey = useKeybinding("thread.settle")
  const pinned = useThreadPinned(thread.id)
  const activity = useThreadActivity(thread.id)
  const workingStartedAtMs =
    activity?.kind === "working"
      ? resolveWorkingStartedAtMs({ latestTurn: thread.latestTurn })
      : null
  const lastActivityAtMs = resolveSidebarLastActivityAtMs(thread)
  const branch = resolveSidebarCheckoutBranch({
    threadBranch: threadBranchOf(thread),
    liveBranch,
  })
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(thread.title)

  useEffect(() => {
    setTitle(thread.title)
  }, [thread.title])

  useEffect(() => {
    if (!renaming) {
      return
    }
    const frame = requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [renaming])

  const commitRename = () => {
    const nextTitle = title.trim()
    setRenaming(false)
    if (nextTitle === "" || nextTitle === thread.title) {
      setTitle(thread.title)
      return
    }
    void buildAndDispatchCommand(
      makeThreadMetaUpdateRequest({ threadId: thread.id, title: nextTitle }),
    ).then((result) => {
      if (!result.ok) {
        setTitle(thread.title)
        showFailureToast(
          presentFailure(result.failure, {
            operation: "thread.rename",
            scope: "project",
            initiatedByUser: true,
            hasUsableData: true,
          }),
        )
      }
      return undefined
    })
  }

  const openPullRequest = (pr: VcsStatusPullRequest) => {
    openWorkspacePullRequest(thread.id, { number: pr.number, url: pr.url })
    if (!isActive) {
      void navigate({
        to: "/projects/$projectId/thread/$threadId",
        params: { projectId: project.id, threadId: thread.id },
      })
    }
    onSelect()
  }

  const deleteThread = () => {
    void buildAndDispatchCommand(makeThreadDeleteRequest({ threadId: thread.id })).then(
      (result) => {
        if (!result.ok) {
          showFailureToast(
            presentFailure(result.failure, {
              operation: "thread.delete",
              scope: "project",
              initiatedByUser: true,
              hasUsableData: true,
            }),
          )
          return undefined
        }
        if (!isActive) {
          return undefined
        }
        return navigate({
          to: "/projects/$projectId/board",
          params: { projectId: project.id },
        })
      },
    )
  }

  if (renaming) {
    return (
      <div className="flex h-8 items-center rounded-lg px-2">
        <Input
          ref={titleInputRef}
          size="sm"
          value={title}
          aria-label="Thread title"
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur()
            }
            if (event.key === "Escape") {
              setTitle(thread.title)
              setRenaming(false)
            }
          }}
          className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-0 text-sm shadow-none"
        />
      </div>
    )
  }

  return (
    <>
      <ContextMenu onOpenChange={setMenuOpen}>
        <ContextMenuTrigger render={<div />}>
          <div className="relative min-w-0">
            <SidebarMenuButton
              render={
                <Link
                  to="/projects/$projectId/thread/$threadId"
                  params={{ projectId: project.id, threadId: thread.id }}
                  onClick={onSelect}
                  onPointerEnter={() => {
                    if (!isActive) {
                      prefetchThreadSnapshot(thread.id)
                    }
                  }}
                  onFocus={() => {
                    if (!isActive) {
                      prefetchThreadSnapshot(thread.id)
                    }
                  }}
                />
              }
              isActive={isActive}
              aria-label={thread.title}
              tooltip={{
                hidden: menuOpen,
                side: "right",
                align: "start",
                sideOffset: 8,
                variant: "glass",
                className:
                  "max-w-80 text-left whitespace-normal [&_[data-slot=tooltip-viewport]]:p-0",
                children: (
                  <ThreadSidebarPopover project={project} thread={thread} branch={branch} />
                ),
              }}
              className={cn(
                "min-w-0 flex-1",
                settled && !isActive
                  ? "group/thread-item h-auto min-h-16 items-start py-2 text-sidebar-foreground/38 [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-normal"
                  : "group/thread-item h-auto min-h-16 items-start py-2 text-sidebar-foreground/58 [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-normal",
              )}
            >
              <ThreadSidebarItemContent
                title={thread.title}
                projectName={project.name}
                pinned={pinned}
                branch={branch}
                worktreePath={threadWorktreePathOf(thread)}
                activity={activity}
                workingStartedAtMs={workingStartedAtMs}
                lastActivityAtMs={lastActivityAtMs}
                hasPullRequest={pullRequest !== null}
                provider={thread.provider}
                settled={settled}
                settleable={settled || canSettle(thread)}
                onSettle={() => dispatchThreadSettle(thread, !settled)}
              />
            </SidebarMenuButton>
            {pullRequest === null ? null : (
              <div
                data-slot="thread-sidebar-pull-request"
                className="absolute end-7 bottom-2 flex items-center"
              >
                <ThreadPullRequestBadge
                  compact
                  pr={pullRequest}
                  onOpen={(event) => {
                    if (event.metaKey) {
                      window.open(pullRequest.url, "_blank", "noopener,noreferrer")
                      return
                    }
                    openPullRequest(pullRequest)
                  }}
                />
              </div>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuPopup align="start" className="w-52">
          <ContextMenuItem
            closeOnClick
            onClick={() => {
              setRenaming(true)
            }}
          >
            <PencilIcon />
            Rename
            <ContextMenuShortcut hotkey={renameHotkey} />
          </ContextMenuItem>
          <ContextMenuItem
            closeOnClick
            disabled={thread.latestTurn === null}
            onClick={() => dispatchThreadTitleRegenerate(thread.id)}
          >
            <RefreshCwIcon />
            Regenerate title
          </ContextMenuItem>
          <ContextMenuItem closeOnClick onClick={() => toggleThreadPinned(thread.id)}>
            {pinned ? <PinOffIcon /> : <PinIcon />}
            {pinned ? "Unpin" : "Pin"}
            <ContextMenuShortcut hotkey={pinHotkey} />
          </ContextMenuItem>
          <ContextMenuItem
            closeOnClick
            disabled={!settled && !canSettle(thread)}
            onClick={() => dispatchThreadSettle(thread, !settled)}
          >
            {settled ? <CircleDotIcon /> : <CircleCheckIcon />}
            {settled ? "Unsettle" : "Settle"}
            <ContextMenuShortcut hotkey={settleHotkey} />
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            closeOnClick
            variant="destructive"
            onClick={() => requestAnimationFrame(() => setDeleteConfirmOpen(true))}
          >
            <Trash2Icon />
            Delete
          </ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
      <ThreadDeleteConfirmDialog
        open={deleteConfirmOpen}
        threadTitle={thread.title}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={deleteThread}
      />
    </>
  )
})

function ThreadSidebarItemContent({
  title,
  projectName,
  pinned,
  branch,
  worktreePath,
  activity,
  workingStartedAtMs,
  lastActivityAtMs,
  hasPullRequest,
  provider,
  settled,
  settleable,
  onSettle,
}: {
  readonly title: string
  readonly projectName: string
  readonly pinned: boolean
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly activity: ThreadActivity | null
  readonly workingStartedAtMs: number | null
  readonly lastActivityAtMs: number | null
  readonly hasPullRequest: boolean
  readonly provider: ThreadShell["provider"]
  readonly settled: boolean
  readonly settleable: boolean
  readonly onSettle: () => void
}) {
  const providers = useProviders()
  const ProviderIcon = providerInstanceIconOf(provider, providers)
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span
        data-slot="thread-sidebar-activity"
        className="flex min-h-4 min-w-0 items-center gap-1.5"
      >
        <span
          data-slot="thread-sidebar-project"
          className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-sidebar-foreground/45"
        >
          <FolderIcon aria-hidden className="size-3 shrink-0 opacity-70" />
          <span className="min-w-0 truncate">{projectName}</span>
        </span>
        <span className="ml-auto grid min-h-4 shrink-0 justify-items-end">
          <span
            className={
              settleable
                ? "col-start-1 row-start-1 flex items-center gap-1 transition-[opacity,filter] duration-150 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover/thread-item:pointer-events-none [@media(hover:hover)]:group-hover/thread-item:opacity-0 [@media(hover:hover)]:group-hover/thread-item:blur-[2px]"
                : "col-start-1 row-start-1 flex items-center gap-1"
            }
          >
            {pinned ? <ThreadSidebarPinnedMark labeled /> : null}
            {activity !== null ? (
              <ThreadSidebarStatus activity={activity} startedAtMs={workingStartedAtMs} />
            ) : lastActivityAtMs === null ? null : (
              <span data-slot="thread-sidebar-last-activity" title="Last activity">
                <span className="sr-only">Last activity: </span>
                <LiveElapsed
                  startedAtMs={lastActivityAtMs}
                  format={formatAgoCompactLabel}
                  className="font-mono text-[11px] tabular-nums text-sidebar-foreground/45"
                />
              </span>
            )}
          </span>
          {settleable ? (
            <span className="col-start-1 row-start-1 flex items-center gap-1 opacity-0 blur-[2px] transition-[opacity,filter] duration-150 ease-out pointer-events-none motion-reduce:transition-none [@media(hover:hover)]:group-hover/thread-item:pointer-events-auto [@media(hover:hover)]:group-hover/thread-item:opacity-100 [@media(hover:hover)]:group-hover/thread-item:blur-none">
              {pinned ? <ThreadSidebarPinnedMark /> : null}
              <ThreadSidebarSettleButton settled={settled} onSettle={onSettle} />
            </span>
          ) : null}
        </span>
      </span>
      <span className="min-w-0 truncate">{title}</span>
      <span
        data-slot="thread-sidebar-checkout"
        className={cn(
          "flex min-h-4 min-w-0 items-center gap-1.5 text-xs text-sidebar-foreground/45",
          hasPullRequest && "pe-14",
        )}
      >
        {branch === null ? (
          <span className="flex-1" />
        ) : (
          <>
            {worktreePath === null ? (
              <GitBranchIcon aria-label="Branch" className="size-3 shrink-0 opacity-70" />
            ) : (
              <FolderGit2Icon aria-label="Worktree" className="size-3 shrink-0 opacity-70" />
            )}
            <span className="min-w-0 flex-1 truncate whitespace-nowrap">{branch}</span>
          </>
        )}
        <ProviderIcon aria-hidden className="size-3 shrink-0" />
      </span>
    </span>
  )
}

function ThreadSidebarPinnedMark({ labeled = false }: { readonly labeled?: boolean }) {
  return (
    <PinIcon
      aria-label={labeled ? "Pinned" : undefined}
      aria-hidden={labeled ? undefined : true}
      className="size-3 shrink-0 text-sidebar-foreground/55"
    />
  )
}

function ThreadSidebarSettleButton({
  settled,
  onSettle,
}: {
  readonly settled: boolean
  readonly onSettle: () => void
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      data-slot="thread-sidebar-settle"
      aria-label={settled ? "Unsettle Thread" : "Settle Thread"}
      className="inline-flex cursor-pointer items-center self-center whitespace-nowrap text-[11px] font-medium text-sidebar-foreground/45 transition-colors duration-150 ease-out motion-reduce:transition-none hover:text-sidebar-accent-foreground"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onSettle()
      }}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {settled ? "Unsettle" : "Settle"}
    </button>
  )
}
