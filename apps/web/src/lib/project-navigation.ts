import type { ProjectId } from "@noyau/contracts/ids"

type ProjectRef = { readonly id: ProjectId }

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
