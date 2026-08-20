import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  FolderInputIcon,
  LayoutGridIcon,
  MessageCirclePlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { ProjectDeleteConfirmDialog } from "@/components/sidebar/ProjectDeleteConfirmDialog"
import { ThreadSidebarItem } from "@/components/sidebar/ThreadSidebarItem"
import { ThreadSidebarSection } from "@/components/sidebar/ThreadSidebarSection"
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { makeProjectDeleteRequest } from "@/lib/project-commands"
import { destinationAfterProjectRemoval, isViewingProject } from "@/lib/project-navigation"
import { cn } from "@/lib/utils"

export function ProjectSidebarItem({
  project,
  threads,
  remainingProjects,
  pathname,
  onSelect,
  onRebind,
}: {
  readonly project: ProjectShell
  readonly threads: ReadonlyArray<ThreadShell>
  readonly remainingProjects: ReadonlyArray<Pick<ProjectShell, "id">>
  readonly pathname: string
  readonly onSelect: () => void
  readonly onRebind: () => void
}) {
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [open, setOpen] = useState(true)
  const viewingThisProject = isViewingProject(pathname, project.id)

  const deleteProject = () => {
    void buildAndDispatchCommand(makeProjectDeleteRequest({ projectId: project.id })).then(
      (result) => {
        if (!result.ok || !viewingThisProject) {
          return undefined
        }
        const destination = destinationAfterProjectRemoval(remainingProjects)
        return destination.to === "/"
          ? navigate({ to: "/", replace: true })
          : navigate({
              to: destination.to,
              params: { projectId: destination.projectId },
              replace: true,
            })
      },
    )
  }

  return (
    <SidebarMenuItem>
      <ContextMenu>
        <ContextMenuTrigger render={<div />}>
          <div className="mb-1 flex items-center group-data-[collapsible=icon]:justify-center">
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? `Replier ${project.name}` : `Déplier ${project.name}`}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              onClick={() => {
                setOpen((current) => !current)
              }}
            >
              <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                {project.name.slice(0, 2).toLocaleLowerCase("fr")}
              </div>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {project.name}
                </p>
              </div>
              <ChevronDownIcon
                className={cn(
                  "size-3 shrink-0 text-sidebar-foreground/30 transition-transform group-data-[collapsible=icon]:hidden",
                  open && "rotate-180",
                )}
              />
            </button>
            {project.available ? null : (
              <button
                type="button"
                className="pr-2 text-[0.62rem] text-warning underline-offset-2 hover:underline group-data-[collapsible=icon]:hidden"
                onClick={onRebind}
              >
                Relier
              </button>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuPopup align="start" className="w-44">
          <ContextMenuItem closeOnClick onClick={onRebind}>
            <FolderInputIcon />
            Relier le dossier
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            closeOnClick
            variant="destructive"
            onClick={() => {
              setDeleteOpen(true)
            }}
          >
            <Trash2Icon />
            Retirer
          </ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
      {open ? (
        <>
          <SidebarMenuButton
            render={
              <Link
                to="/projects/$projectId/board"
                params={{ projectId: project.id }}
                onClick={onSelect}
              />
            }
            isActive={pathname === `/projects/${project.id}/board`}
            tooltip="Tableau"
            className="h-8 text-sidebar-foreground/58"
          >
            <LayoutGridIcon />
            <span>Tableau</span>
          </SidebarMenuButton>
          <SidebarMenuButton
            render={
              <Link
                to="/projects/$projectId/thread/$threadId"
                params={{ projectId: project.id, threadId: "new" }}
                onClick={onSelect}
              />
            }
            isActive={pathname === `/projects/${project.id}/thread/new`}
            tooltip="Nouveau Thread"
            className="mt-1 h-8 pl-8 text-sidebar-foreground/58"
          >
            <MessageCirclePlusIcon />
            <span>Nouveau Thread</span>
          </SidebarMenuButton>
          <ThreadSidebarSection
            threads={threads.filter((thread) => thread.status === "active")}
            renderThread={(thread) => (
              <ThreadSidebarItem
                thread={thread}
                project={project}
                isActive={pathname === `/projects/${project.id}/thread/${thread.id}`}
                onSelect={onSelect}
              />
            )}
          />
        </>
      ) : null}
      <ProjectDeleteConfirmDialog
        open={deleteOpen}
        projectName={project.name}
        threadCount={threads.length}
        onOpenChange={setDeleteOpen}
        onConfirm={deleteProject}
      />
    </SidebarMenuItem>
  )
}
