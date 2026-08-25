import type { ProjectShell } from "@noyau/protocol/shell"
import { Link } from "@tanstack/react-router"
import { LayoutGridIcon } from "lucide-react"

import { ThreadSidebarItem } from "@/components/sidebar/ThreadSidebarItem"
import { ThreadSidebarSection } from "@/components/sidebar/ThreadSidebarSection"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useProjectThreads } from "@/hooks/use-control-plane"
import { useMergedWorktreeCleanup } from "@/hooks/use-merged-worktree-cleanup"
import { useThreadChangeRequests } from "@/hooks/use-thread-change-requests"

export function ProjectSidebarItem({
  project,
  pathname,
  onSelect,
}: {
  readonly project: ProjectShell
  readonly pathname: string
  readonly onSelect: () => void
}) {
  const threads = useProjectThreads(project.id)
  const { pullRequests, liveBranches } = useThreadChangeRequests(project.id, threads)
  useMergedWorktreeCleanup(project.id, threads, pullRequests)
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
        pullRequests={pullRequests}
        renderThread={(thread, settled) => (
          <ThreadSidebarItem
            thread={thread}
            project={project}
            pullRequest={pullRequests.get(thread.id) ?? null}
            liveBranch={liveBranches.get(thread.id) ?? null}
            isActive={pathname === `/projects/${project.id}/thread/${thread.id}`}
            settled={settled}
            onSelect={onSelect}
          />
        )}
      />
    </SidebarMenuItem>
  )
}
