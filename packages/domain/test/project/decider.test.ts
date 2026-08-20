import { describe, expect, it } from "@effect/vitest"
import { decide } from "@noyau/domain/project/decider"
import { emptyProjectCatalog, evolve, type ProjectCatalog } from "@noyau/domain/project/projector"
import { ProjectCommand } from "@noyau/protocol/project/commands"
import type { ProjectEvent } from "@noyau/protocol/project/events"
import { Result, Schema } from "effect"

const ids = {
  project: "3f8f0d70-1111-4000-8000-000000000001",
  other: "3f8f0d70-1111-4000-8000-000000000021",
  command: "3f8f0d70-1111-4000-8000-000000000010",
  correlation: "3f8f0d70-1111-4000-8000-000000000011",
  backlog: "3f8f0d70-1111-4000-8000-000000000031",
  active: "3f8f0d70-1111-4000-8000-000000000032",
  done: "3f8f0d70-1111-4000-8000-000000000033",
} as const

const roots = {
  noyau: "/Users/hezaerd/noyau",
  other: "/Users/hezaerd/autre",
} as const

const meta = {
  commandId: ids.command,
  projectId: ids.project,
  actorId: "human:hezaerd",
  correlationId: ids.correlation,
  issuedAt: "2026-08-13T12:00:00.000Z",
  schemaVersion: 1,
} as const

const command = Schema.decodeUnknownSync(ProjectCommand)
const initialBoard = {
  backlogColumnId: ids.backlog,
  activeColumnId: ids.active,
  doneColumnId: ids.done,
} as const

const success = <A, E>(result: Result.Result<A, E>): A => {
  expect(Result.isSuccess(result)).toBe(true)
  if (!Result.isSuccess(result)) {
    throw new Error(`Expected success, received ${String(result.failure)}`)
  }
  return result.success
}

const failure = <A, E>(result: Result.Result<A, E>): E => {
  expect(Result.isFailure(result)).toBe(true)
  if (!Result.isFailure(result)) {
    throw new Error("Expected failure")
  }
  return result.failure
}

const apply = (catalog: ProjectCatalog, events: ReadonlyArray<ProjectEvent>) =>
  events.reduce(evolve, catalog)

const createProject = (
  catalog: ProjectCatalog = emptyProjectCatalog,
  projectId: string = ids.project,
  workspaceRoot: string = roots.noyau,
  name = "Noyau",
) =>
  success(
    decide(
      catalog,
      command({
        _tag: "project.create",
        ...meta,
        projectId,
        payload: { projectId, name, workspaceRoot },
        initialBoard,
      }),
    ),
  )

const catalogWithProject = () => apply(emptyProjectCatalog, createProject())

describe("project.create", () => {
  it("relie un dossier existant sans inventer de worktree", () => {
    const events = createProject()
    const catalog = apply(emptyProjectCatalog, events)

    expect(events.map((event) => event._tag)).toEqual(["project.created"])
    expect(catalog.projects).toEqual([
      {
        projectId: ids.project,
        name: "Noyau",
        workspaceRoot: roots.noyau,
      },
    ])
    expect(events[0]).not.toHaveProperty("worktree")
  })

  it("refuse un Project déjà présent", () => {
    const error = failure(
      decide(
        catalogWithProject(),
        command({
          _tag: "project.create",
          ...meta,
          payload: { projectId: ids.project, name: "Dup", workspaceRoot: roots.other },
          initialBoard,
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "ProjectAlreadyExists", projectId: ids.project })
  })

  it("refuse un WorkspaceRoot déjà relié à un autre Project", () => {
    const error = failure(
      decide(
        catalogWithProject(),
        command({
          _tag: "project.create",
          ...meta,
          projectId: ids.other,
          payload: { projectId: ids.other, name: "Autre", workspaceRoot: roots.noyau },
          initialBoard,
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "WorkspaceRootConflict",
      workspaceRoot: roots.noyau,
      projectId: ids.project,
    })
  })
})

describe("project.rebind", () => {
  it("rebaptise le WorkspaceRoot du Project", () => {
    const catalog = catalogWithProject()
    const events = success(
      decide(
        catalog,
        command({
          _tag: "project.rebind",
          ...meta,
          payload: { projectId: ids.project, workspaceRoot: roots.other },
        }),
      ),
    )
    const next = apply(catalog, events)

    expect(events.map((event) => event._tag)).toEqual(["project.rebound"])
    expect(next.projects[0]).toMatchObject({
      projectId: ids.project,
      workspaceRoot: roots.other,
    })
  })

  it("autorise un rebind vers le même chemin", () => {
    const events = success(
      decide(
        catalogWithProject(),
        command({
          _tag: "project.rebind",
          ...meta,
          payload: { projectId: ids.project, workspaceRoot: roots.noyau },
        }),
      ),
    )

    expect(events[0]?._tag).toBe("project.rebound")
  })

  it("refuse de prendre le WorkspaceRoot d'un autre Project", () => {
    const first = catalogWithProject()
    const both = apply(first, createProject(first, ids.other, roots.other, "Autre"))
    const error = failure(
      decide(
        both,
        command({
          _tag: "project.rebind",
          ...meta,
          payload: { projectId: ids.project, workspaceRoot: roots.other },
        }),
      ),
    )

    expect(error).toMatchObject({
      _tag: "WorkspaceRootConflict",
      workspaceRoot: roots.other,
      projectId: ids.other,
    })
  })

  it("refuse un Project absent", () => {
    const error = failure(
      decide(
        emptyProjectCatalog,
        command({
          _tag: "project.rebind",
          ...meta,
          payload: { projectId: ids.project, workspaceRoot: roots.other },
        }),
      ),
    )

    expect(error._tag).toBe("ProjectNotFound")
  })
})

describe("project.meta et delete", () => {
  it("met à jour le nom et ignore une méta sans champ", () => {
    const catalog = catalogWithProject()
    const renamed = apply(
      catalog,
      success(
        decide(
          catalog,
          command({
            _tag: "project.meta.update",
            ...meta,
            payload: { projectId: ids.project, name: "Noyau v0.1" },
          }),
        ),
      ),
    )
    const omitted = apply(
      renamed,
      success(
        decide(
          renamed,
          command({
            _tag: "project.meta.update",
            ...meta,
            payload: { projectId: ids.project },
          }),
        ),
      ),
    )

    expect(renamed.projects[0]?.name).toBe("Noyau v0.1")
    expect(omitted.projects[0]?.name).toBe("Noyau v0.1")
  })

  it("retire le Project et libère son WorkspaceRoot", () => {
    const catalog = catalogWithProject()
    const deleted = apply(
      catalog,
      success(
        decide(
          catalog,
          command({
            _tag: "project.delete",
            ...meta,
            payload: { projectId: ids.project },
          }),
        ),
      ),
    )

    expect(deleted.projects).toEqual([])
    expect(createProject(deleted).map((event) => event._tag)).toEqual(["project.created"])
  })
})
