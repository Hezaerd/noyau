import { ProjectId } from "@noyau/contracts/ids"
import type { ProjectShell } from "@noyau/contracts/shell"
import {
  ChevronDownIcon,
  FolderIcon,
  FolderInputIcon,
  FolderPlusIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"

export function ProjectSwitcher({
  projects,
  selectedProject,
  onSelect,
  onAdd,
  onRebind,
  onRemove,
}: {
  readonly projects: ReadonlyArray<ProjectShell>
  readonly selectedProject: ProjectShell | undefined
  readonly onSelect: (projectId: ProjectId) => void
  readonly onAdd: () => void
  readonly onRebind: () => void
  readonly onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1 px-3 pb-3">
      <Menu>
        <MenuTrigger
          disabled={selectedProject === undefined}
          render={
            <button
              type="button"
              aria-label="Switch Project"
              className="relative flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/45 px-2.5 text-left text-sm text-sidebar-foreground transition-colors pointer-coarse:min-h-11 hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50"
            />
          }
        >
          <FolderIcon className="size-4 shrink-0 text-sidebar-foreground/80" />
          <span className="min-w-0 flex-1 truncate">{selectedProject?.name ?? "No Project"}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-sidebar-foreground/80" />
        </MenuTrigger>
        <MenuPopup align="start" className="w-(--anchor-width)">
          <MenuRadioGroup
            value={selectedProject?.id}
            onValueChange={(value) => {
              if (value !== undefined) {
                onSelect(ProjectId.make(value))
              }
            }}
          >
            {projects.map((project) => (
              <MenuRadioItem
                key={project.id}
                value={project.id}
                closeOnClick
                className="h-8 min-h-8 px-1 py-0 text-sm font-medium [&>span:last-child]:flex [&>span:last-child]:min-w-0 [&>span:last-child]:items-center [&>span:last-child]:gap-2"
              >
                <FolderIcon className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{project.name}</span>
                {project.available ? null : (
                  <span className="ml-auto shrink-0 text-[0.65rem] font-normal text-warning">
                    Missing
                  </span>
                )}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
          {selectedProject === undefined ? null : (
            <>
              <MenuSeparator />
              <MenuItem closeOnClick onClick={onRebind}>
                <FolderInputIcon />
                Link the folder
              </MenuItem>
              <MenuItem closeOnClick variant="destructive" onClick={onRemove}>
                <Trash2Icon />
                Remove the Project
              </MenuItem>
            </>
          )}
        </MenuPopup>
      </Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Link a folder"
              className="size-9 shrink-0 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={onAdd}
            />
          }
        >
          <FolderPlusIcon />
        </TooltipTrigger>
        <TooltipPopup side="right">Link a folder</TooltipPopup>
      </Tooltip>
    </div>
  )
}
