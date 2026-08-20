import type { ProjectId } from "@noyau/protocol/ids"

type ProjectRef = { readonly id: ProjectId }

export const nextLastProjectId = (
  projects: ReadonlyArray<ProjectRef>,
  lastProjectId: ProjectId | undefined,
): ProjectId | undefined => {
  if (lastProjectId !== undefined && projects.some((project) => project.id === lastProjectId)) {
    return lastProjectId
  }
  return projects[0]?.id
}

export const destinationAfterProjectRemoval = (
  remaining: ReadonlyArray<ProjectRef>,
):
  | { readonly to: "/" }
  | { readonly to: "/projects/$projectId/board"; readonly projectId: ProjectId } => {
  const next = remaining[0]
  return next === undefined ? { to: "/" } : { to: "/projects/$projectId/board", projectId: next.id }
}

export const isViewingProject = (pathname: string, projectId: ProjectId): boolean =>
  pathname.startsWith(`/projects/${projectId}/`)
