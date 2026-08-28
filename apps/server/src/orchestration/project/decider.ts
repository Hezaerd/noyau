import type { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import type { ProjectId } from "@noyau/contracts/ids"
import type { ProjectCommand } from "@noyau/contracts/project/commands"
import {
  ProjectAlreadyExists,
  ProjectNotFound,
  WorkspaceRootConflict,
} from "@noyau/contracts/project/errors"
import {
  ProjectCreated,
  ProjectDeleted,
  type ProjectEvent,
  ProjectMetaUpdated,
  ProjectRebound,
} from "@noyau/contracts/project/events"
import { Result } from "effect"

import type { ProjectCatalog, ProjectState } from "./projector.ts"

export type ProjectDecisionError = ProjectAlreadyExists | ProjectNotFound | WorkspaceRootConflict

const findProject = (catalog: ProjectCatalog, projectId: ProjectId) =>
  catalog.projects.find((project) => project.projectId === projectId)

const workspaceOwner = (
  catalog: ProjectCatalog,
  workspaceRoot: WorkspaceRoot,
  excludedProjectId?: ProjectId,
): ProjectState | undefined =>
  catalog.projects.find(
    (project) => project.workspaceRoot === workspaceRoot && project.projectId !== excludedProjectId,
  )

const requireProject = (
  catalog: ProjectCatalog,
  projectId: ProjectId,
): Result.Result<ProjectState, ProjectNotFound> => {
  const project = findProject(catalog, projectId)
  return project === undefined
    ? Result.fail(new ProjectNotFound({ projectId }))
    : Result.succeed(project)
}

/**
 * Decider pur du catalogue Project. Aucune IO : le dossier n'est ni créé
 * ni inspecté ; `WorkspaceRoot` est un chemin déjà porté par la commande.
 */
export const decide = (
  catalog: ProjectCatalog,
  command: ProjectCommand,
): Result.Result<ReadonlyArray<ProjectEvent>, ProjectDecisionError> => {
  switch (command._tag) {
    case "project.create": {
      if (findProject(catalog, command.payload.projectId) !== undefined) {
        return Result.fail(new ProjectAlreadyExists({ projectId: command.payload.projectId }))
      }
      const owner = workspaceOwner(catalog, command.payload.workspaceRoot)
      if (owner !== undefined) {
        return Result.fail(
          new WorkspaceRootConflict({
            workspaceRoot: command.payload.workspaceRoot,
            projectId: owner.projectId,
          }),
        )
      }
      return Result.succeed([
        ProjectCreated.make({
          projectId: command.payload.projectId,
          name: command.payload.name,
          workspaceRoot: command.payload.workspaceRoot,
          defaultModelSelection: null,
        }),
      ])
    }
    case "project.meta.update":
      return requireProject(catalog, command.payload.projectId).pipe(
        Result.map(() => [ProjectMetaUpdated.make(command.payload)]),
      )
    case "project.rebind":
      return requireProject(catalog, command.payload.projectId).pipe(
        Result.flatMap((): Result.Result<ReadonlyArray<ProjectEvent>, ProjectDecisionError> => {
          const owner = workspaceOwner(
            catalog,
            command.payload.workspaceRoot,
            command.payload.projectId,
          )
          if (owner !== undefined) {
            return Result.fail(
              new WorkspaceRootConflict({
                workspaceRoot: command.payload.workspaceRoot,
                projectId: owner.projectId,
              }),
            )
          }
          return Result.succeed([
            ProjectRebound.make({
              projectId: command.payload.projectId,
              workspaceRoot: command.payload.workspaceRoot,
            }),
          ])
        }),
      )
    case "project.delete":
      return requireProject(catalog, command.payload.projectId).pipe(
        Result.map((project) => [ProjectDeleted.make({ projectId: project.projectId })]),
      )
  }
}
