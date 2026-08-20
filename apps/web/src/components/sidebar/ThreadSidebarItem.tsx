import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  EllipsisVerticalIcon,
  MessageCircleIcon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { ThreadSidebarPopover } from "@/components/sidebar/ThreadSidebarPopover"
import { Input } from "@/components/ui/input"
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu"
import { SidebarMenuAction, SidebarMenuButton } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import {
  makeThreadArchiveRequest,
  makeThreadMetaUpdateRequest,
  makeThreadTitleRegenerateRequest,
} from "@/lib/thread-commands"
import { cn } from "@/lib/utils"

export function ThreadSidebarItem({
  thread,
  project,
  isActive,
  onSelect,
}: {
  readonly thread: ThreadShell
  readonly project: Pick<ProjectShell, "id" | "name" | "workspaceRoot">
  readonly isActive: boolean
  readonly onSelect: () => void
}) {
  const navigate = useNavigate()
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [title, setTitle] = useState(thread.title)

  useEffect(() => {
    setTitle(thread.title)
    setRegenerating(false)
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
    )
  }

  const regenerateTitle = () => {
    setRegenerating(true)
    void buildAndDispatchCommand(makeThreadTitleRegenerateRequest({ threadId: thread.id })).then(
      (result) => {
        if (!result.ok) {
          setRegenerating(false)
        }
      },
    )
  }

  const archiveThread = () => {
    void buildAndDispatchCommand(makeThreadArchiveRequest({ threadId: thread.id })).then(
      (result) => {
        if (!result.ok || !isActive) {
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
    <div className="group/thread relative">
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
          className: "max-w-80 text-left whitespace-normal [&_[data-slot=tooltip-viewport]]:p-0",
          children: <ThreadSidebarPopover project={project} thread={thread} />,
        }}
        className="h-8 pe-8 pl-8 text-sidebar-foreground/58"
      >
        <MessageCircleIcon />
        <span className="truncate">{thread.title}</span>
        {regenerating ? <Spinner className="ml-auto size-3.5" /> : null}
      </SidebarMenuButton>
      <Menu open={menuOpen} onOpenChange={setMenuOpen}>
        <MenuTrigger
          render={
            <SidebarMenuAction
              showOnHover={false}
              aria-label={`Actions du Thread ${thread.title}`}
              className={cn(
                "opacity-0 group-hover/thread:opacity-100 group-focus-within/thread:opacity-100 data-popup-open:opacity-100",
                (isActive || menuOpen) && "opacity-100",
              )}
            >
              <EllipsisVerticalIcon />
            </SidebarMenuAction>
          }
        />
        <MenuPopup align="start" side="right" className="w-44">
          <MenuItem
            closeOnClick
            onClick={() => {
              setRenaming(true)
            }}
          >
            <PencilIcon />
            Renommer
          </MenuItem>
          <MenuItem closeOnClick disabled={regenerating} onClick={regenerateTitle}>
            <RefreshCwIcon />
            Régénérer le titre
          </MenuItem>
          <MenuSeparator />
          <MenuItem closeOnClick variant="destructive" onClick={archiveThread}>
            <Trash2Icon />
            Archiver
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  )
}
