import { describe, expect, it } from "@effect/vitest"
import { Command } from "@noyau/contracts/commands"
import type { DomainEvent } from "@noyau/contracts/events"
import { ProjectId } from "@noyau/contracts/ids"
import { DEFAULT_THREAD_TITLE } from "@noyau/contracts/thread/title"
import {
  decide,
  emptyControlState,
  evolve,
  recoverControlStateAfterBoot,
  type ControlState,
} from "@noyau/server/orchestration/control-state"
import { BOOT_RECOVERY_LAST_ERROR } from "@noyau/server/orchestration/thread/recovery"
import { Result, Schema } from "effect"

const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  backlog: "3f8f0d70-1111-4000-8000-000000000031",
  active: "3f8f0d70-1111-4000-8000-000000000032",
  done: "3f8f0d70-1111-4000-8000-000000000033",
  ticket: "3f8f0d70-1111-4000-8000-000000000005",
  thread: "20000000-0000-4000-8000-000000000001",
  command: "70000000-0000-4000-8000-000000000001",
  command2: "70000000-0000-4000-8000-000000000002",
  correlation: "80000000-0000-4000-8000-000000000001",
} as const

const issuedAt = "2026-08-20T02:00:00.000Z"
const recoveredAt = "2026-08-20T03:00:00.000Z"
const resumeCursor = {
  schemaVersion: 1 as const,
  sessionId: "cursor-session-1",
}

const meta = {
  commandId: ids.command,
  projectId: ids.project,
  actorId: "human:hezaerd",
  correlationId: ids.correlation,
  issuedAt,
  schemaVersion: 1,
} as const

const initialBoard = {
  backlogColumnId: ids.backlog,
  activeColumnId: ids.active,
  doneColumnId: ids.done,
} as const

const command = Schema.decodeUnknownSync(Command)
const projectId = Schema.decodeSync(ProjectId)(ids.project)
const recoveredAtUtc = Schema.decodeSync(Schema.DateTimeUtcFromString)(recoveredAt)

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

const apply = (state: ControlState, events: ReadonlyArray<DomainEvent>) =>
  events.reduce(evolve, state)

const createProject = (state: ControlState = emptyControlState) =>
  success(
    decide(
      state,
      command({
        _tag: "project.create",
        ...meta,
        payload: {
          projectId: ids.project,
          name: "Noyau",
          workspaceRoot: "/Users/hezaerd/noyau",
        },
        initialBoard,
      }),
    ),
  )

const stateWithProject = () => apply(emptyControlState, createProject())

const createThread = (state: ControlState) =>
  success(
    decide(
      state,
      command({
        _tag: "thread.create",
        ...meta,
        commandId: ids.command2,
        payload: {
          threadId: ids.thread,
          projectId: ids.project,
          title: DEFAULT_THREAD_TITLE,
        },
      }),
    ),
  )

describe("project.create", () => {
  it("produit les faits project et le board initial", () => {
    const events = createProject()
    const state = apply(emptyControlState, events)

    expect(events.map((event) => event._tag)).toEqual([
      "project.created",
      "board.initialized",
      "kanbanColumn.created",
      "kanbanColumn.created",
      "kanbanColumn.created",
    ])
    expect(state.projects.projects).toEqual([
      {
        projectId: ids.project,
        name: "Noyau",
        workspaceRoot: "/Users/hezaerd/noyau",
        defaultModelSelection: null,
      },
    ])
    expect(state.board.columns.map((column) => column.columnId)).toEqual([
      ids.backlog,
      ids.active,
      ids.done,
    ])
    expect(state.threads.availableProjectIds).toEqual([projectId])
    expect(state.board.projectThreadIds).toEqual([])
  })

  it("n'initialise pas le board si le project est refusé", () => {
    const error = failure(
      decide(
        stateWithProject(),
        command({
          _tag: "project.create",
          ...meta,
          payload: {
            projectId: ids.project,
            name: "Dup",
            workspaceRoot: "/Users/hezaerd/autre",
          },
          initialBoard,
        }),
      ),
    )

    expect(error).toMatchObject({ _tag: "ProjectAlreadyExists", projectId: ids.project })
  })
})

describe("routing", () => {
  it("laisse le board intact sur project.meta.update", () => {
    const before = stateWithProject()
    const events = success(
      decide(
        before,
        command({
          _tag: "project.meta.update",
          ...meta,
          commandId: ids.command2,
          payload: { projectId: ids.project, name: "Renamed" },
        }),
      ),
    )
    const after = apply(before, events)

    expect(events.map((event) => event._tag)).toEqual(["project.meta-updated"])
    expect(after.projects.projects[0]?.name).toBe("Renamed")
    expect(after.board.columns).toEqual(before.board.columns)
  })

  it("route ticket.create uniquement vers le board", () => {
    const before = stateWithProject()
    const events = success(
      decide(
        before,
        command({
          _tag: "ticket.create",
          ...meta,
          commandId: ids.command2,
          payload: {
            projectId: ids.project,
            ticketId: ids.ticket,
            title: "Ticket",
            placement: { columnId: ids.backlog },
          },
        }),
      ),
    )
    const after = apply(before, events)

    expect(events.map((event) => event._tag)).toEqual(["ticket.created"])
    expect(after.projects.projects).toEqual(before.projects.projects)
    expect(after.threads.threads).toEqual(before.threads.threads)
    expect(after.board.tickets).toHaveLength(1)
  })

  it("compose les thread ids sur le board après thread.create", () => {
    const before = stateWithProject()
    const events = createThread(before)
    const after = apply(before, events)

    expect(events.map((event) => event._tag)).toEqual(["thread.created"])
    expect(after.board.columns).toEqual(before.board.columns)
    expect(after.board.projectThreadIds).toEqual([ids.thread])
    expect(after.threads.availableProjectIds).toEqual([projectId])
  })
})

describe("recoverControlStateAfterBoot", () => {
  it("passe les sessions running en error sans toucher project ni board", () => {
    const withProject = stateWithProject()
    const withThread = apply(withProject, createThread(withProject))
    const sessionEvents = success(
      decide(
        withThread,
        command({
          _tag: "thread.session.set",
          ...meta,
          commandId: ids.command2,
          payload: {
            threadId: ids.thread,
            session: {
              threadId: ids.thread,
              status: "running",
              lastError: null,
              activeTurnId: null,
              runtimeMode: "full-access",
              resumeCursor,
              updatedAt: issuedAt,
            },
          },
        }),
      ),
    )
    const running = apply(withThread, sessionEvents)
    const recovered = recoverControlStateAfterBoot(running, recoveredAtUtc)

    expect(running.threads.threads[0]?.session?.status).toBe("running")
    expect(recovered.threads.threads[0]?.session?.status).toBe("error")
    expect(recovered.threads.threads[0]?.session?.lastError).toBe(BOOT_RECOVERY_LAST_ERROR)
    expect(recovered.threads.threads[0]?.session?.updatedAt).toEqual(recoveredAtUtc)
    expect(recovered.projects).toEqual(running.projects)
    expect(recovered.board).toEqual(running.board)
  })
})
