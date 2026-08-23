import type { VcsStatusPullRequest } from "@noyau/protocol/git"
import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"
import { Link, useNavigate } from "@tanstack/react-router"
import { MessageCircleIcon, PencilIcon, Trash2Icon } from "lucide-react"
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
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import { resolveThreadActivity, resolveWorkingStartedAtMs } from "@/lib/thread-activity"
import { makeThreadArchiveRequest, makeThreadMetaUpdateRequest } from "@/lib/thread-commands"

export function ThreadSidebarItem({
  thread,
  project,
  pullRequest,
  isActive,
  onSelect,
}: {
  readonly thread: ThreadShell
  readonly project: Pick<ProjectShell, "id" | "name" | "workspaceRoot">
  readonly pullRequest: VcsStatusPullRequest | null
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
      <div className="flex h-8 items-center gap-2 rounded-lg px-2 pl-8">
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
            tooltip={{
              hidden: menuOpen,
              side: "right",
              align: "start",
              sideOffset: 8,
              className:
                "max-w-80 text-left whitespace-normal [&_[data-slot=tooltip-viewport]]:p-0",
              children: (
                <ThreadSidebarPopover project={project} thread={thread} pullRequest={pullRequest} />
              ),
            }}
            className="h-8 pl-8 text-sidebar-foreground/58"
          >
            <MessageCircleIcon />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate">{thread.title}</span>
              {activity === null ? null : (
                <ThreadSidebarStatus activity={activity} startedAtMs={workingStartedAtMs} />
              )}
              {pullRequest === null ? null : <ThreadPullRequestBadge pr={pullRequest} compact />}
            </span>
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
