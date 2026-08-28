import type { ProjectShell } from "@noyau/contracts/shell"
import { Link } from "@tanstack/react-router"
import { LayoutGridIcon, SquarePenIcon } from "lucide-react"

import { ThreadSidebarItem } from "@/components/sidebar/ThreadSidebarItem"
import { ThreadSidebarSection } from "@/components/sidebar/ThreadSidebarSection"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useAutoSettleMergedThreads } from "@/hooks/use-auto-settle-merged-threads"
import { useProjectThreads } from "@/hooks/use-control-plane"
import { useCreateDraftThread } from "@/hooks/use-create-draft-thread"
import { useKeybinding } from "@/hooks/use-keybindings"
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
  const createDraftThread = useCreateDraftThread()
  const createThreadHotkey = useKeybinding("thread.create")
  useAutoSettleMergedThreads(threads, pullRequests)
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          tooltip={{
            className: "inline-flex items-center gap-1.5",
            children: (
              <>
                New Agent
                <KeyboardShortcut hotkey={createThreadHotkey} />
              </>
            ),
          }}
          className="h-8 text-sidebar-foreground/58"
          onClick={() => {
            onSelect()
            void createDraftThread(project)
          }}
        >
          <SquarePenIcon />
          <span>New Agent</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
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
          tooltip="Board"
          className="h-8 text-sidebar-foreground/58"
        >
          <LayoutGridIcon />
          <span>Board</span>
        </SidebarMenuButton>
        <ThreadSidebarSection
          projectId={project.id}
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
    </>
  )
}
