import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"
import { Link } from "@tanstack/react-router"
import { LayoutGridIcon } from "lucide-react"

import { ThreadSidebarItem } from "@/components/sidebar/ThreadSidebarItem"
import { ThreadSidebarSection } from "@/components/sidebar/ThreadSidebarSection"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useThreadChangeRequests } from "@/hooks/use-thread-change-requests"

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
  const { pullRequests, liveBranches } = useThreadChangeRequests(project.id, threads)
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
      <ThreadSidebarSection
        threads={threads.filter((thread) => thread.status === "active")}
        renderThread={(thread) => (
          <ThreadSidebarItem
            thread={thread}
            project={project}
            pullRequest={pullRequests.get(thread.id) ?? null}
            liveBranch={liveBranches.get(thread.id) ?? null}
            isActive={pathname === `/projects/${project.id}/thread/${thread.id}`}
            onSelect={onSelect}
          />
        )}
      />
    </SidebarMenuItem>
  )
}
