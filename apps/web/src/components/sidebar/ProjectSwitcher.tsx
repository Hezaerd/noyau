import { ProjectId } from "@noyau/protocol/ids"
import type { ProjectShell } from "@noyau/protocol/shell"
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
              aria-label="Changer de Project"
              className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/45 px-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50"
            />
          }
        >
          <FolderIcon className="size-4 shrink-0 text-sidebar-foreground/70" />
          <span className="min-w-0 flex-1 truncate">
            {selectedProject?.name ?? "Aucun Project"}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-sidebar-foreground/50" />
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
                    Introuvable
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
                Relier le dossier
              </MenuItem>
              <MenuItem closeOnClick variant="destructive" onClick={onRemove}>
                <Trash2Icon />
                Retirer le Project
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
              aria-label="Relier un dossier"
              className="size-9 shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={onAdd}
            />
          }
        >
          <FolderPlusIcon />
        </TooltipTrigger>
        <TooltipPopup side="right">Relier un dossier</TooltipPopup>
      </Tooltip>
    </div>
  )
}
