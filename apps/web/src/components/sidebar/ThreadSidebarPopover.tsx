import type { ProjectShell, ThreadShell } from "@noyau/contracts/shell"
import { GitBranchIcon, LayersIcon } from "lucide-react"

import { useProviders } from "@/hooks/use-control-plane"
import { modelsByProvider, providerDriverOf, providerIconOf } from "@/lib/provider-presentation"
import { catalogModels, threadModelLabel } from "@/lib/thread-sidebar-popover"

export function ThreadSidebarPopover({
  thread,
  project,
  branch,
}: {
  readonly thread: Pick<ThreadShell, "title" | "provider" | "modelSelection">
  readonly project: Pick<ProjectShell, "name">
  readonly branch: string | null
}) {
  const providers = useProviders()
  const models = catalogModels(thread.provider, modelsByProvider(providers))
  const ProviderIcon = providerIconOf(providerDriverOf(thread.provider, providers))

  return (
    <div className="flex min-w-56 max-w-80 flex-col gap-2.5 p-3">
      <p className="text-xs font-semibold leading-snug text-foreground">{thread.title}</p>
      <ul className="grid gap-1.5">
        <li className="flex min-w-0 items-center gap-2 text-xs text-foreground/75">
          <LayersIcon className="size-3 shrink-0 text-sidebar-primary" />
          <span className="min-w-0 truncate">{project.name}</span>
        </li>
        {branch === null || branch === "" ? null : (
          <li className="flex min-w-0 items-center gap-2 text-xs text-foreground/75">
            <GitBranchIcon className="size-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 truncate">{branch}</span>
          </li>
        )}
        <li className="flex min-w-0 items-center gap-2 text-xs text-foreground/75">
          <ProviderIcon aria-hidden className="size-3 shrink-0" />
          <span className="min-w-0 truncate">
            {threadModelLabel(thread.modelSelection, models)}
          </span>
        </li>
      </ul>
    </div>
  )
}
