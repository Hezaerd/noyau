import { DEFAULT_RUNTIME_MODE } from "@noyau/protocol/entities/runtime-mode"
import type { Session } from "@noyau/protocol/entities/session"
import { TurnId } from "@noyau/protocol/ids"
import { ProjectUnavailable } from "@noyau/protocol/project/errors"
import type { ThreadCommand } from "@noyau/protocol/thread/commands"
import {
  ApprovalRequestNotFound,
  ImageAttachmentRejected,
  SessionNotRunning,
  ThreadAlreadyExists,
  ThreadArchived as ThreadArchivedError,
  ThreadNotArchived,
  ThreadNotFound,
  TurnAlreadyActive,
  TurnNotFound,
} from "@noyau/protocol/thread/errors"
import {
  ApprovalResponded,
  SessionStopRequested,
  ThreadArchived,
  ThreadCreated,
  type ThreadEvent,
  ThreadMetaUpdated,
  ThreadRestored,
  ThreadRuntimeModeSet,
  ThreadSessionSet,
  ThreadTitleSeeded,
  ThreadTranscriptAppended,
  ThreadTurnEnded,
  ThreadTurnInterrupted,
  ThreadTurnStarted,
  UserInputResponded,
} from "@noyau/protocol/thread/events"
import { Result } from "effect"

import type { ThreadProjection, ThreadState, TurnProjection } from "./projector.ts"

export type ThreadDecisionError =
  | ApprovalRequestNotFound
  | ImageAttachmentRejected
  | ProjectUnavailable
  | SessionNotRunning
  | ThreadAlreadyExists
  | ThreadArchivedError
  | ThreadNotArchived
  | ThreadNotFound
  | TurnAlreadyActive
  | TurnNotFound

const findThread = (state: ThreadState, threadId: ThreadProjection["threadId"]) =>
  state.threads.find((thread) => thread.threadId === threadId)

const requireThread = (
  state: ThreadState,
  threadId: ThreadProjection["threadId"],
): Result.Result<ThreadProjection, ThreadNotFound> => {
  const thread = findThread(state, threadId)
  return thread === undefined
    ? Result.fail(new ThreadNotFound({ threadId }))
    : Result.succeed(thread)
}

const requireAvailableProject = (
  state: ThreadState,
  thread: Pick<ThreadProjection, "projectId">,
): Result.Result<void, ProjectUnavailable> =>
  state.availableProjectIds.includes(thread.projectId)
    ? Result.succeed(undefined)
    : Result.fail(new ProjectUnavailable({ projectId: thread.projectId }))

const requireActiveThread = (thread: ThreadProjection): Result.Result<void, ThreadArchivedError> =>
  thread.status === "archived"
    ? Result.fail(new ThreadArchivedError({ threadId: thread.threadId }))
    : Result.succeed(undefined)

const runningTurn = (thread: ThreadProjection): TurnProjection | undefined =>
  thread.turns.find((turn) => turn.state === "running")

const requireRunningTurn = (
  thread: ThreadProjection,
  requestedTurnId?: TurnProjection["turnId"],
): Result.Result<TurnProjection, TurnNotFound | SessionNotRunning> => {
  const turn = runningTurn(thread)
  if (turn === undefined || thread.session?.status !== "running") {
    return Result.fail(new SessionNotRunning({ threadId: thread.threadId }))
  }
  return requestedTurnId !== undefined && requestedTurnId !== turn.turnId
    ? Result.fail(new TurnNotFound({ threadId: thread.threadId, turnId: requestedTurnId }))
    : Result.succeed(turn)
}

const hasImage = (
  payload: Extract<ThreadCommand, { _tag: "thread.turn.start" }>["payload"],
): boolean =>
  payload.attachments !== undefined || payload.image !== undefined || payload.images !== undefined

const terminalSession = (
  session: Session,
  command: Extract<ThreadCommand, { _tag: "thread.turn.ended" }>,
): Session => {
  const status =
    command.payload.state === "completed"
      ? "ready"
      : command.payload.state === "error"
        ? "error"
        : "interrupted"
  const lastError =
    command.payload.state === "error"
      ? (command.payload.lastError ?? session.lastError ?? "Provider turn error")
      : null
  return {
    ...session,
    status,
    lastError,
    activeTurnId: null,
    updatedAt: command.issuedAt,
  }
}

/**
 * Decider pur de Thread, Session, Turn et transcript. Le `commandId` enrichi
 * devient l'identité stable du Turn : le contrat start ne porte aucun autre
 * UUID, et un retry conserve ainsi exactement le même Turn.
 */
export const decide = (
  state: ThreadState,
  command: ThreadCommand,
): Result.Result<ReadonlyArray<ThreadEvent>, ThreadDecisionError> => {
  switch (command._tag) {
    case "thread.create": {
      if (findThread(state, command.payload.threadId) !== undefined) {
        return Result.fail(new ThreadAlreadyExists({ threadId: command.payload.threadId }))
      }
      return requireAvailableProject(state, { projectId: command.payload.projectId }).pipe(
        Result.map(() => [
          ThreadCreated.make({
            threadId: command.payload.threadId,
            projectId: command.payload.projectId,
            title: command.payload.title,
            provider: "cursor",
            runtimeMode: command.payload.runtimeMode ?? DEFAULT_RUNTIME_MODE,
          }),
        ]),
      )
    }
    case "thread.archive":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) =>
          thread.status === "archived"
            ? Result.fail(new ThreadArchivedError({ threadId: thread.threadId }))
            : Result.succeed([ThreadArchived.make({ threadId: thread.threadId })]),
        ),
      )
    case "thread.restore":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) =>
          thread.status !== "archived"
            ? Result.fail(new ThreadNotArchived({ threadId: thread.threadId }))
            : Result.succeed([ThreadRestored.make({ threadId: thread.threadId })]),
        ),
      )
    case "thread.meta.update":
      return requireThread(state, command.payload.threadId).pipe(
        Result.map(() => [ThreadMetaUpdated.make(command.payload)]),
      )
    case "thread.runtime-mode.set":
      return requireThread(state, command.payload.threadId).pipe(
        Result.map(() => [ThreadRuntimeModeSet.make(command.payload)]),
      )
    case "thread.turn.start":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread): Result.Result<void, ThreadDecisionError> =>
          requireActiveThread(thread).pipe(
            Result.flatMap(() => requireAvailableProject(state, thread)),
            Result.flatMap(() => {
              const active = runningTurn(thread)
              return active === undefined
                ? Result.succeed(undefined)
                : Result.fail(
                    new TurnAlreadyActive({
                      threadId: thread.threadId,
                      turnId: active.turnId,
                    }),
                  )
            }),
            Result.flatMap(() =>
              hasImage(command.payload)
                ? Result.fail(new ImageAttachmentRejected({ threadId: thread.threadId }))
                : Result.succeed(undefined),
            ),
          ),
        ),
        Result.map(() => {
          const started = {
            threadId: command.payload.threadId,
            turnId: TurnId.make(command.commandId),
            text: command.payload.text,
            titleSeed: command.payload.titleSeed ?? command.payload.text,
          }
          return [
            command.payload.runtimeMode === undefined
              ? ThreadTurnStarted.make(started)
              : ThreadTurnStarted.make({
                  ...started,
                  runtimeMode: command.payload.runtimeMode,
                }),
          ]
        }),
      )
    case "thread.turn.interrupt":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) => requireRunningTurn(thread, command.payload.turnId)),
        Result.map((turn) => [
          ThreadTurnInterrupted.make({
            threadId: command.payload.threadId,
            turnId: turn.turnId,
          }),
        ]),
      )
    case "approval.respond":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) => {
          const pending = thread.transcript.some(
            (item) =>
              item._tag === "transcript.permission" &&
              item.requestId === command.payload.requestId &&
              item.status === "pending",
          )
          return pending
            ? Result.succeed([ApprovalResponded.make(command.payload)])
            : Result.fail(
                new ApprovalRequestNotFound({
                  threadId: command.payload.threadId,
                  requestId: command.payload.requestId,
                }),
              )
        }),
      )
    case "user-input.respond":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) => {
          const pending = thread.transcript.some(
            (item) =>
              item._tag === "transcript.user-input" &&
              item.requestId === command.payload.requestId &&
              item.status === "pending",
          )
          return pending
            ? Result.succeed([UserInputResponded.make(command.payload)])
            : Result.fail(
                new ApprovalRequestNotFound({
                  threadId: command.payload.threadId,
                  requestId: command.payload.requestId,
                }),
              )
        }),
      )
    case "session.stop":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) =>
          thread.session === null ||
          thread.session.status === "idle" ||
          thread.session.status === "stopped"
            ? Result.fail(new SessionNotRunning({ threadId: thread.threadId }))
            : Result.succeed([SessionStopRequested.make({ threadId: thread.threadId })]),
        ),
      )
    case "thread.session.set":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread): Result.Result<ReadonlyArray<ThreadEvent>, ThreadDecisionError> => {
          const active = runningTurn(thread)
          const session = command.payload.session
          if (session.threadId !== thread.threadId) {
            return Result.fail(new ThreadNotFound({ threadId: session.threadId }))
          }
          if (session.status === "running" && session.activeTurnId !== null) {
            if (active !== undefined && active.turnId !== session.activeTurnId) {
              return Result.fail(
                new TurnAlreadyActive({
                  threadId: thread.threadId,
                  turnId: active.turnId,
                }),
              )
            }
            const referenced = thread.turns.find((turn) => turn.turnId === session.activeTurnId)
            if (referenced === undefined || referenced.state !== "running") {
              return Result.fail(
                new TurnNotFound({
                  threadId: thread.threadId,
                  turnId: session.activeTurnId,
                }),
              )
            }
          }
          return Result.succeed([
            ThreadSessionSet.make({
              threadId: thread.threadId,
              session,
            }),
          ])
        }),
      )
    case "thread.transcript.append":
      return requireThread(state, command.payload.item.threadId).pipe(
        Result.flatMap((thread): Result.Result<ReadonlyArray<ThreadEvent>, ThreadDecisionError> => {
          const turn = thread.turns.find(
            (candidate) => candidate.turnId === command.payload.item.turnId,
          )
          if (turn === undefined) {
            return Result.fail(
              new TurnNotFound({
                threadId: thread.threadId,
                turnId: command.payload.item.turnId,
              }),
            )
          }
          return turn.state === "running"
            ? Result.succeed([ThreadTranscriptAppended.make(command.payload)])
            : Result.fail(new SessionNotRunning({ threadId: thread.threadId }))
        }),
      )
    case "thread.turn.ended":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) => {
          const session = thread.session
          return session === null
            ? Result.fail(new SessionNotRunning({ threadId: thread.threadId }))
            : requireRunningTurn(thread, command.payload.turnId).pipe(
                Result.map((turn) => {
                  const ended = {
                    threadId: thread.threadId,
                    turnId: turn.turnId,
                    state: command.payload.state,
                  }
                  return [
                    command.payload.lastError === undefined
                      ? ThreadTurnEnded.make(ended)
                      : ThreadTurnEnded.make({
                          ...ended,
                          lastError: command.payload.lastError,
                        }),
                    ThreadSessionSet.make({
                      threadId: thread.threadId,
                      session: terminalSession(session, command),
                    }),
                  ]
                }),
              )
        }),
      )
    case "thread.title.seeded":
      return requireThread(state, command.payload.threadId).pipe(
        Result.map(() => [ThreadTitleSeeded.make(command.payload)]),
      )
  }
}
