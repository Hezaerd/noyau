import { threadBranchOf, threadWorktreePathOf } from "@noyau/protocol/entities/checkout"
import type { VcsStatusPullRequest } from "@noyau/protocol/git"
import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  CircleCheckIcon,
  CircleDotIcon,
  FolderGit2Icon,
  GitBranchIcon,
  MessageCircleIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"
import { memo, useEffect, useRef, useState } from "react"

import { CursorIcon, type ProviderIcon } from "@/components/provider-icons"
import { ThreadArchiveConfirmDialog } from "@/components/sidebar/ThreadArchiveConfirmDialog"
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
import { useKeybinding } from "@/hooks/use-keybindings"
import { useThreadActivity } from "@/hooks/use-sidebar-queues"
import { useThreadPinned } from "@/hooks/use-thread-pins"
import { resolveSidebarCheckoutBranch } from "@/lib/checkout"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import {
  formatAgoCompactLabel,
  resolveSidebarLastActivityAtMs,
  resolveWorkingStartedAtMs,
  type ThreadActivity,
} from "@/lib/thread-activity"
import { makeThreadArchiveRequest, makeThreadMetaUpdateRequest } from "@/lib/thread-commands"
import { dispatchThreadSettle } from "@/lib/thread-settle-actions"
import { canSettle } from "@/lib/thread-settled"
import { toggleThreadPinned } from "@/state/thread-pins"

const providerIcons = {
  cursor: CursorIcon,
} as const satisfies Record<ThreadShell["provider"], ProviderIcon>

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
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
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

  const archiveThread = () => {
    void buildAndDispatchCommand(makeThreadArchiveRequest({ threadId: thread.id })).then(
      (result) => {
        if (!result.ok) {
          showFailureToast(
            presentFailure(result.failure, {
              operation: "thread.archive",
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
      <div className="flex h-8 items-center gap-2 rounded-lg px-2">
        <MessageCircleIcon className="size-4 shrink-0 text-sidebar-foreground/58" />
        <Input
          ref={titleInputRef}
          size="sm"
          value={title}
          aria-label="Titre du Thread"
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
          className="h-7 min-w-0 flex-1 border-transparent bg-transparent px-1 text-sm shadow-none"
        />
      </div>
    )
  }

  return (
    <>
      <ContextMenu onOpenChange={setMenuOpen}>
        <ContextMenuTrigger render={<div />}>
          <SidebarMenuButton
            render={
              <Link
                to="/projects/$projectId/thread/$threadId"
                params={{ projectId: project.id, threadId: thread.id }}
                onClick={onSelect}
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
              children: <ThreadSidebarPopover project={project} thread={thread} branch={branch} />,
            }}
            className={
              settled && !isActive
                ? "h-auto min-h-16 items-start py-2 text-sidebar-foreground/38 [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-normal"
                : "h-auto min-h-16 items-start py-2 text-sidebar-foreground/58 [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-normal"
            }
          >
            <MessageCircleIcon className="mt-0.5" />
            <ThreadSidebarItemContent
              title={thread.title}
              pinned={pinned}
              branch={branch}
              worktreePath={threadWorktreePathOf(thread)}
              activity={activity}
              workingStartedAtMs={workingStartedAtMs}
              lastActivityAtMs={lastActivityAtMs}
              pullRequest={pullRequest}
              provider={thread.provider}
            />
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuPopup align="start" className="w-44">
          <ContextMenuItem
            closeOnClick
            onClick={() => {
              setRenaming(true)
            }}
          >
            <PencilIcon />
            Renommer
          </ContextMenuItem>
          <ContextMenuItem closeOnClick onClick={() => toggleThreadPinned(thread.id)}>
            {pinned ? <PinOffIcon /> : <PinIcon />}
            {pinned ? "Désépingler" : "Épingler"}
            <ContextMenuShortcut hotkey={pinHotkey} />
          </ContextMenuItem>
          <ContextMenuItem
            closeOnClick
            disabled={!settled && !canSettle(thread)}
            onClick={() => dispatchThreadSettle(thread, !settled)}
          >
            {settled ? <CircleDotIcon /> : <CircleCheckIcon />}
            {settled ? "Déclasser" : "Classer"}
            <ContextMenuShortcut hotkey={settleHotkey} />
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            closeOnClick
            variant="destructive"
            onClick={() => requestAnimationFrame(() => setArchiveConfirmOpen(true))}
          >
            <Trash2Icon />
            Archiver
          </ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
      <ThreadArchiveConfirmDialog
        open={archiveConfirmOpen}
        threadTitle={thread.title}
        onOpenChange={setArchiveConfirmOpen}
        onConfirm={archiveThread}
      />
    </>
  )
})

function ThreadSidebarItemContent({
  title,
  pinned,
  branch,
  worktreePath,
  activity,
  workingStartedAtMs,
  lastActivityAtMs,
  pullRequest,
  provider,
}: {
  readonly title: string
  readonly pinned: boolean
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly activity: ThreadActivity | null
  readonly workingStartedAtMs: number | null
  readonly lastActivityAtMs: number | null
  readonly pullRequest: VcsStatusPullRequest | null
  readonly provider: ThreadShell["provider"]
}) {
  const ProviderIcon = providerIcons[provider]
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span
        data-slot="thread-sidebar-activity"
        className="flex min-h-4 min-w-0 items-center gap-1.5"
      >
        {activity === null ? (
          <span className="min-w-0 flex-1" />
        ) : (
          <span className="min-w-0 flex-1 truncate">
            <ThreadSidebarStatus activity={activity} startedAtMs={workingStartedAtMs} />
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {pinned ? (
            <PinIcon aria-label="Épinglé" className="size-3 shrink-0 text-sidebar-foreground/55" />
          ) : null}
          {lastActivityAtMs === null ? null : (
            <span data-slot="thread-sidebar-last-activity" title="Dernière activité">
              <LiveElapsed
                startedAtMs={lastActivityAtMs}
                format={formatAgoCompactLabel}
                hidden
                className="font-mono text-[11px] tabular-nums text-sidebar-foreground/45"
              />
            </span>
          )}
        </span>
      </span>
      <span className="min-w-0 truncate">{title}</span>
      <span
        data-slot="thread-sidebar-checkout"
        className="flex min-h-4 min-w-0 items-center gap-1.5 text-xs text-sidebar-foreground/45"
      >
        {branch === null ? (
          <span className="flex-1" />
        ) : (
          <>
            {worktreePath === null ? (
              <GitBranchIcon aria-label="Branche" className="size-3 shrink-0 opacity-70" />
            ) : (
              <FolderGit2Icon aria-label="Worktree" className="size-3 shrink-0 opacity-70" />
            )}
            <span className="min-w-0 flex-1 truncate whitespace-nowrap">{branch}</span>
          </>
        )}
        <span className="flex shrink-0 items-center gap-1.5">
          {pullRequest === null ? null : <ThreadPullRequestBadge pr={pullRequest} compact />}
          <ProviderIcon aria-hidden className="size-3 shrink-0" />
        </span>
      </span>
    </span>
  )
}
