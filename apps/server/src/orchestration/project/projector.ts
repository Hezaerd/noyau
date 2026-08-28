import type { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import type { DefaultModelSelection } from "@noyau/contracts/entities/model-selection"
import type { ProjectId } from "@noyau/contracts/ids"
import type { ProjectEvent } from "@noyau/contracts/project/events"

export interface ProjectState {
  readonly projectId: ProjectId
  readonly name: string
  readonly workspaceRoot: WorkspaceRoot
  readonly defaultModelSelection: DefaultModelSelection | null
}

/** Catalogue Environment des Projects encore présents. */
export interface ProjectCatalog {
  readonly projects: ReadonlyArray<ProjectState>
}

export const emptyProjectCatalog: ProjectCatalog = {
  projects: [],
}

const updateProject = (
  catalog: ProjectCatalog,
  projectId: ProjectId,
  update: (project: ProjectState) => ProjectState,
): ProjectCatalog => ({
  projects: catalog.projects.map((project) =>
    project.projectId === projectId ? update(project) : project,
  ),
})

export const evolve = (catalog: ProjectCatalog, event: ProjectEvent): ProjectCatalog => {
  switch (event._tag) {
    case "project.created":
      return {
        projects: [
          ...catalog.projects,
          {
            projectId: event.projectId,
            name: event.name,
            workspaceRoot: event.workspaceRoot,
            defaultModelSelection: event.defaultModelSelection ?? null,
          },
        ],
      }
    case "project.meta-updated": {
      return updateProject(catalog, event.projectId, (project) => {
        let updated = project
        if (event.name !== undefined) {
          updated = { ...updated, name: event.name }
        }
        if (event.defaultModelSelection !== undefined) {
          updated = { ...updated, defaultModelSelection: event.defaultModelSelection }
        }
        return updated
      })
    }
    case "project.rebound":
      return updateProject(catalog, event.projectId, (project) => ({
        ...project,
        workspaceRoot: event.workspaceRoot,
      }))
    case "project.deleted":
      return {
        projects: catalog.projects.filter((project) => project.projectId !== event.projectId),
      }
  }
}

export const replay = (events: Iterable<ProjectEvent>): ProjectCatalog => {
  let catalog = emptyProjectCatalog
  for (const event of events) {
    catalog = evolve(catalog, event)
  }
  return catalog
}
