import type { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import type { ProjectId } from "@noyau/protocol/ids"
import type { ProjectEvent } from "@noyau/protocol/project/events"

export interface ProjectState {
  readonly projectId: ProjectId
  readonly name: string
  readonly workspaceRoot: WorkspaceRoot
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
          },
        ],
      }
    case "project.meta-updated": {
      const name = event.name
      return name === undefined
        ? catalog
        : updateProject(catalog, event.projectId, (project) => ({
            ...project,
            name,
          }))
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
