import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"
import { Link } from "@tanstack/react-router"
import { LayoutGridIcon, MessageCirclePlusIcon } from "lucide-react"

import { ThreadSidebarItem } from "@/components/sidebar/ThreadSidebarItem"
import { ThreadSidebarSection } from "@/components/sidebar/ThreadSidebarSection"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function ProjectSidebarItem({
  project,
  threads,
  pathname,
  onSelect,
}: {
  readonly project: ProjectShell
  readonly threads: ReadonlyArray<ThreadShell>
  readonly pathname: string
  readonly onSelect: () => void
}) {
  return (
    <SidebarMenuItem>
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
    </SidebarMenuItem>
  )
}
