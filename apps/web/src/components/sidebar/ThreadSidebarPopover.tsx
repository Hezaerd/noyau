import type { ProjectShell, ThreadShell } from "@noyau/protocol/shell"
import {
  BoxIcon,
  CircleAlertIcon,
  FolderIcon,
  LayersIcon,
  LoaderCircleIcon,
  ShieldIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import {
  threadSidebarPopoverRows,
  type ThreadSidebarPopoverRowKind,
} from "@/lib/thread-sidebar-popover"
import { cn } from "@/lib/utils"

const rowIcons = {
  project: <LayersIcon className="size-3 shrink-0 text-sidebar-primary" />,
  workspace: <FolderIcon className="size-3 shrink-0 text-muted-foreground" />,
  provider: <BoxIcon className="size-3 shrink-0 text-muted-foreground" />,
  runtimeMode: <ShieldIcon className="size-3 shrink-0 text-muted-foreground" />,
  status: <LoaderCircleIcon className="size-3 shrink-0 text-muted-foreground" />,
  error: <CircleAlertIcon className="size-3 shrink-0 text-destructive" />,
} satisfies Record<ThreadSidebarPopoverRowKind, ReactNode>

export function ThreadSidebarPopover({
  thread,
  project,
}: {
  readonly thread: Pick<
    ThreadShell,
    "title" | "provider" | "runtimeMode" | "sessionStatus" | "latestTurn" | "lastError"
  >
  readonly project: Pick<ProjectShell, "name"> & { readonly workspaceRoot: string }
}) {
  const rows = threadSidebarPopoverRows({
    projectName: project.name,
    workspaceRoot: project.workspaceRoot,
    provider: thread.provider,
    runtimeMode: thread.runtimeMode,
    sessionStatus: thread.sessionStatus,
    latestTurn: thread.latestTurn,
    lastError: thread.lastError,
  })

  return (
    <div className="flex min-w-56 max-w-80 flex-col gap-2.5 p-3">
      <p className="text-xs font-medium leading-snug text-foreground">{thread.title}</p>
      <ul className="grid gap-1.5">
        {rows.map((row) => (
          <li
            key={row.kind}
            className={cn(
              "flex min-w-0 items-center gap-2 text-xs text-foreground/75",
              row.kind === "error" && "text-destructive",
            )}
          >
            {rowIcons[row.kind]}
            <span className="min-w-0 truncate">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
