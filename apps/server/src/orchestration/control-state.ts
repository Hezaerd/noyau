import type { Command } from "@noyau/contracts/commands"
import type { DomainEvent } from "@noyau/contracts/events"
import { ProjectCommand } from "@noyau/contracts/project/commands"
import { ProjectEvent } from "@noyau/contracts/project/events"
import type { Rejection } from "@noyau/contracts/receipts"
import { ThreadCommand } from "@noyau/contracts/thread/commands"
import { ThreadEvent } from "@noyau/contracts/thread/events"
import { BoardInitialize, TicketCommand } from "@noyau/contracts/ticket/commands"
import { TicketEvent } from "@noyau/contracts/ticket/events"
import { DateTime, Result, Schema } from "effect"

import { decide as decideBoard } from "./board/decider.ts"
import {
  emptyBoardState,
  evolve as evolveBoard,
  type BoardState,
  withProjectThreads,
} from "./board/projector.ts"
import { decide as decideProject } from "./project/decider.ts"
import {
  emptyProjectCatalog,
  evolve as evolveProject,
  type ProjectCatalog,
} from "./project/projector.ts"
import { decide as decideThread } from "./thread/decider.ts"
import {
  emptyThreadState,
  evolve as evolveThread,
  type ThreadState,
  withAvailableProjects,
} from "./thread/projector.ts"
import { recoverAfterBoot } from "./thread/recovery.ts"

/**
 * Join in-memory des trois agrégats. Le journal est clé
 * `{ kind: "project", id: projectId }`, donc project, board et thread
 * rejouent comme un seul blob. `project.create` est la seule commande
 * qui traverse deux deciders.
 */
export interface ControlState {
  readonly projects: ProjectCatalog
  readonly board: BoardState
  readonly threads: ThreadState
}

export const emptyControlState: ControlState = {
  projects: emptyProjectCatalog,
  board: emptyBoardState,
  threads: emptyThreadState,
}

const isProjectCommand = Schema.is(ProjectCommand)
const isTicketCommand = Schema.is(TicketCommand)
const isThreadCommand = Schema.is(ThreadCommand)
const isProjectEvent = Schema.is(ProjectEvent)
const isTicketEvent = Schema.is(TicketEvent)
const isThreadEvent = Schema.is(ThreadEvent)

export const decide = (
  state: ControlState,
  command: Command,
): Result.Result<ReadonlyArray<DomainEvent>, Rejection> => {
  if (isProjectCommand(command)) {
    const projectDecision = decideProject(state.projects, command)
    if (command._tag !== "project.create") {
      return projectDecision
    }
    const initializationFields = {
      commandId: command.commandId,
      projectId: command.projectId,
      actorId: command.actorId,
      correlationId: command.correlationId,
      issuedAt: command.issuedAt,
      schemaVersion: command.schemaVersion,
      payload: command.initialBoard,
    }
    const initialization =
      command.causationId === undefined
        ? BoardInitialize.make(initializationFields)
        : BoardInitialize.make({ ...initializationFields, causationId: command.causationId })
    return projectDecision.pipe(
      Result.flatMap((projectEvents) =>
        decideBoard(state.board, initialization).pipe(
          Result.map((boardEvents) => Array.from<DomainEvent>(projectEvents).concat(boardEvents)),
        ),
      ),
    )
  }
  if (isTicketCommand(command)) {
    return decideBoard(state.board, command)
  }
  return decideThread(
    state.threads,
    isThreadCommand(command) ? command : Schema.decodeSync(ThreadCommand)(command),
  )
}

export const evolve = (state: ControlState, event: DomainEvent): ControlState => {
  const projects = isProjectEvent(event) ? evolveProject(state.projects, event) : state.projects
  const board = isTicketEvent(event) ? evolveBoard(state.board, event) : state.board
  const threads = isThreadEvent(event) ? evolveThread(state.threads, event) : state.threads
  const availableProjectIds = projects.projects.map((project) => project.projectId)
  const projectThreadIds = threads.threads.map((thread) => thread.threadId)
  return {
    projects,
    board: withProjectThreads(board, projectThreadIds),
    threads: withAvailableProjects(threads, availableProjectIds),
  }
}

export const recoverControlStateAfterBoot = (
  state: ControlState,
  recoveredAt: DateTime.Utc,
): ControlState => ({
  ...state,
  threads: recoverAfterBoot(state.threads, recoveredAt).reduce(evolveThread, state.threads),
})
