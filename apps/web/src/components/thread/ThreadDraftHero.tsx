import { ProjectId } from "@noyau/contracts/ids"
import type { ProjectShell } from "@noyau/contracts/shell"
import type { ReactNode } from "react"

import {
  Menu,
  MenuGroup,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu"
import { composerOverlayGlassClassName } from "@/lib/composer-glass"
import { cn } from "@/lib/utils"

// Inline + underline, pas truncate : overflow:hidden sur inline-block
// remplace la baseline par le bas de la boîte et soulève le nom.
const projectNameClassName =
  "inline max-w-64 bg-transparent p-0 align-baseline font-[inherit] text-[length:inherit] leading-[inherit] text-foreground underline decoration-dotted decoration-foreground/60 underline-offset-[0.15em]"

export function ThreadDraftHero({
  projectName,
  projects,
  selectedProjectId,
  onSelectProject,
  children,
}: {
  readonly projectName: string | undefined
  readonly projects: ReadonlyArray<Pick<ProjectShell, "id" | "name" | "available">>
  readonly selectedProjectId: ProjectId | undefined
  readonly onSelectProject: (projectId: ProjectId) => void
  readonly children: ReactNode
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 sm:px-6"
      data-slot="thread-draft-hero"
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        <h2 className="w-full text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
          {projectName === undefined ? (
            "What are we building?"
          ) : (
            <>
              What are we building in{" "}
              <ThreadDraftHeroProjectName
                projectName={projectName}
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelectProject={onSelectProject}
              />
              ?
            </>
          )}
        </h2>
        <div className="w-full">{children}</div>
      </div>
    </div>
  )
}

function ThreadDraftHeroProjectName({
  projectName,
  projects,
  selectedProjectId,
  onSelectProject,
}: {
  readonly projectName: string
  readonly projects: ReadonlyArray<Pick<ProjectShell, "id" | "name" | "available">>
  readonly selectedProjectId: ProjectId | undefined
  readonly onSelectProject: (projectId: ProjectId) => void
}) {
  if (projects.length < 2) {
    return (
      <span className={projectNameClassName} title={projectName}>
        {projectName}
      </span>
    )
  }

  return (
    <Menu>
      <MenuTrigger
        className={cn(
          projectNameClassName,
          "cursor-pointer appearance-none transition-colors hover:decoration-foreground focus-visible:rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        )}
        title={projectName}
      >
        {projectName}
      </MenuTrigger>
      <MenuPopup
        align="center"
        className={cn("max-h-80 min-w-40 w-max max-w-64", composerOverlayGlassClassName)}
      >
        <MenuGroup>
          <MenuRadioGroup
            value={selectedProjectId}
            onValueChange={(value) => {
              if (value === undefined || value === selectedProjectId) {
                return
              }
              onSelectProject(ProjectId.make(value))
            }}
          >
            {projects.map((project) => (
              <MenuRadioItem key={project.id} value={project.id} closeOnClick>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate">{project.name}</span>
                  {project.available ? null : (
                    <span className="shrink-0 text-[0.65rem] font-normal text-warning">
                      Missing
                    </span>
                  )}
                </span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  )
}
