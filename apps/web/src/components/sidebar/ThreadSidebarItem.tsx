import { threadBranchOf, threadWorktreePathOf } from "@noyau/protocol/entities/checkout"
import type { VcsStatusPullRequest } from "@noyau/protocol/git"
import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  FolderGit2Icon,
  GitBranchIcon,
  MessageCircleIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { ThreadArchiveConfirmDialog } from "@/components/sidebar/ThreadArchiveConfirmDialog"
import { ThreadSidebarPopover } from "@/components/sidebar/ThreadSidebarPopover"
import { ThreadSidebarStatus } from "@/components/sidebar/ThreadSidebarStatus"
import { ThreadPullRequestBadge } from "@/components/thread/ThreadPullRequestBadge"
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Input } from "@/components/ui/input"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { useThreadVisits } from "@/hooks/use-thread-visits"
import { resolveSidebarCheckoutBranch } from "@/lib/checkout"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import {
  resolveThreadActivity,
  resolveWorkingStartedAtMs,
  type ThreadActivity,
} from "@/lib/thread-activity"
import { makeThreadArchiveRequest, makeThreadMetaUpdateRequest } from "@/lib/thread-commands"

export function ThreadSidebarItem({
  thread,
  project,
  pullRequest,
  liveBranch,
  isActive,
  onSelect,
}: {
  readonly thread: ThreadShell
  readonly project: Pick<ProjectShell, "id" | "name" | "workspaceRoot">
  readonly pullRequest: VcsStatusPullRequest | null
  readonly liveBranch: string | null
  readonly isActive: boolean
  readonly onSelect: () => void
}) {
  const navigate = useNavigate()
  const visits = useThreadVisits()
  const activity = resolveThreadActivity({
    sessionStatus: thread.sessionStatus,
    latestTurn: thread.latestTurn,
    lastVisitedAtMs: visits.get(thread.id),
  })
  const workingStartedAtMs =
    activity?.kind === "working"
      ? resolveWorkingStartedAtMs({
          latestTurn: thread.latestTurn,
          updatedAt: thread.updatedAt,
        })
      : null
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
              className:
                "max-w-80 text-left whitespace-normal [&_[data-slot=tooltip-viewport]]:p-0",
              children: (
                <ThreadSidebarPopover
                  project={project}
                  thread={thread}
                  branch={branch}
                  pullRequest={pullRequest}
                />
              ),
            }}
            className="h-auto min-h-8 items-start py-1.5 text-sidebar-foreground/58 [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-normal"
          >
            <MessageCircleIcon className="mt-0.5" />
            <ThreadSidebarItemContent
              title={thread.title}
              branch={branch}
              worktreePath={threadWorktreePathOf(thread)}
              activity={activity}
              workingStartedAtMs={workingStartedAtMs}
              pullRequest={pullRequest}
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
}

function ThreadSidebarItemContent({
  title,
  branch,
  worktreePath,
  activity,
  workingStartedAtMs,
  pullRequest,
}: {
  readonly title: string
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly activity: ThreadActivity | null
  readonly workingStartedAtMs: number | null
  readonly pullRequest: VcsStatusPullRequest | null
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {activity === null ? null : (
          <ThreadSidebarStatus activity={activity} startedAtMs={workingStartedAtMs} />
        )}
      </span>
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
        {pullRequest === null ? null : <ThreadPullRequestBadge pr={pullRequest} compact />}
      </span>
    </span>
  )
}
