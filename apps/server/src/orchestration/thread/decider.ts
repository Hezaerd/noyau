import { DEFAULT_PROVIDER_INSTANCE_ID } from "@noyau/contracts/entities/environment"
import { DEFAULT_RUNTIME_MODE } from "@noyau/contracts/entities/runtime-mode"
import type { Session } from "@noyau/contracts/entities/session"
import { TurnId } from "@noyau/contracts/ids"
import { ProjectUnavailable } from "@noyau/contracts/project/errors"
import type { ThreadCommand } from "@noyau/contracts/thread/commands"
import {
  ApprovalRequestNotFound,
  ImageAttachmentRejected,
  SessionNotRunning,
  ThreadAlreadyExists,
  ThreadArchived as ThreadArchivedError,
  ThreadForkOriginMismatch,
  ThreadNotFound,
  ThreadNotSettleable,
  TurnAlreadyActive,
  TurnNotFound,
} from "@noyau/contracts/thread/errors"
import {
  ApprovalResponded,
  SessionStopRequested,
  ThreadContextUsageSet,
  ThreadCreated,
  ThreadForkCompleted,
  ThreadForkFailed,
  ThreadForkRequested,
  ThreadDeleted,
  type ThreadEvent,
  ThreadMetaUpdated,
  ThreadSettled,
  ThreadUnsettled,
  ThreadModelSelectionSet,
  ThreadProviderHandedOff,
  ThreadRuntimeModeSet,
  ThreadSessionSet,
  ThreadTitleSeeded,
  ThreadTranscriptAppended,
  ThreadTurnDiffCompleted,
  ThreadTurnEnded,
  ThreadTurnInterrupted,
  ThreadTurnStarted,
  UserInputResponded,
} from "@noyau/contracts/thread/events"
import { seedTitleFromTurn } from "@noyau/contracts/thread/title"
import { Result } from "effect"

import type { ThreadProjection, ThreadState, TurnProjection } from "./projector.ts"

export type ThreadDecisionError =
  | ApprovalRequestNotFound
  | ImageAttachmentRejected
  | ProjectUnavailable
  | SessionNotRunning
  | ThreadAlreadyExists
  | ThreadArchivedError
  | ThreadForkOriginMismatch
  | ThreadNotFound
  | ThreadNotSettleable
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

const hasOpenBlockingRequest = (thread: ThreadProjection): boolean =>
  thread.transcript.some(
    (item) =>
      (item._tag === "transcript.permission" || item._tag === "transcript.user-input") &&
      item.status === "pending",
  )

const hasLiveSession = (thread: ThreadProjection): boolean =>
  thread.session?.status === "starting" || thread.session?.status === "running"

const canSettleThread = (thread: ThreadProjection): boolean =>
  thread.status !== "archived" &&
  !hasLiveSession(thread) &&
  runningTurn(thread) === undefined &&
  !hasOpenBlockingRequest(thread)

const activityUnsettle = (thread: ThreadProjection): ThreadUnsettled | null =>
  thread.settledOverride === null
    ? null
    : ThreadUnsettled.make({ threadId: thread.threadId, reason: "activity" })

const hasLeakedImageUpload = (
  payload: Extract<ThreadCommand, { _tag: "thread.turn.start" }>["payload"],
): boolean => payload.image !== undefined || payload.images !== undefined

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
        Result.map(() => {
          let created: Omit<ThreadCreated, "_tag"> = {
            threadId: command.payload.threadId,
            projectId: command.payload.projectId,
            title: command.payload.title,
            provider: command.payload.provider ?? DEFAULT_PROVIDER_INSTANCE_ID,
            runtimeMode: command.payload.runtimeMode ?? DEFAULT_RUNTIME_MODE,
          }
          if (command.payload.modelSelection !== undefined) {
            created = Object.assign(created, { modelSelection: command.payload.modelSelection })
          }
          if (command.payload.branch !== undefined) {
            created = Object.assign(created, { branch: command.payload.branch })
          }
          if (command.payload.worktreePath !== undefined) {
            created = Object.assign(created, { worktreePath: command.payload.worktreePath })
          }
          return [ThreadCreated.make(created)]
        }),
      )
    }
    case "thread.fork":
      if (findThread(state, command.payload.threadId) !== undefined) {
        return Result.fail(new ThreadAlreadyExists({ threadId: command.payload.threadId }))
      }
      return requireThread(state, command.payload.sourceThreadId).pipe(
        Result.flatMap((source) =>
          source.session?.resumeCursor !== null &&
          source.session?.resumeCursor !== undefined &&
          source.turns.some(
            (turn) =>
              turn.turnId === command.payload.sourceTurnId &&
              turn.state === "completed" &&
              turn.providerForkPoint !== undefined,
          )
            ? Result.succeed([
                ThreadForkRequested.make({
                  threadId: command.payload.threadId,
                  sourceThreadId: command.payload.sourceThreadId,
                  sourceTurnId: command.payload.sourceTurnId,
                }),
              ])
            : Result.fail(
                new TurnNotFound({
                  threadId: command.payload.sourceThreadId,
                  turnId: command.payload.sourceTurnId,
                }),
              ),
        ),
      )
    case "thread.delete":
      return requireThread(state, command.payload.threadId).pipe(
        Result.map((thread) => [ThreadDeleted.make({ threadId: thread.threadId })]),
      )
    case "thread.settle":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) =>
          requireActiveThread(thread).pipe(
            Result.flatMap(() =>
              canSettleThread(thread)
                ? Result.succeed(thread)
                : Result.fail(new ThreadNotSettleable({ threadId: thread.threadId })),
            ),
          ),
        ),
        Result.map((thread) => {
          const alreadySettled = thread.settledOverride === "settled" && thread.settledAt !== null
          const events: Array<ThreadEvent> = [
            ThreadSettled.make({
              threadId: thread.threadId,
              settledAt: alreadySettled ? thread.settledAt : command.issuedAt,
            }),
          ]
          if (
            !alreadySettled &&
            thread.session !== null &&
            thread.session.status !== "idle" &&
            thread.session.status !== "stopped"
          ) {
            events.push(SessionStopRequested.make({ threadId: thread.threadId }))
          }
          return events
        }),
      )
    case "thread.unsettle":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) =>
          requireActiveThread(thread).pipe(
            Result.map(() => [
              ThreadUnsettled.make({
                threadId: thread.threadId,
                reason: command.payload.reason,
              }),
            ]),
          ),
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
    case "thread.model-selection.set":
      return requireThread(state, command.payload.threadId).pipe(
        Result.map(() => [ThreadModelSelectionSet.make(command.payload)]),
      )
    case "thread.turn.start":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread): Result.Result<ThreadProjection, ThreadDecisionError> =>
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
              hasLeakedImageUpload(command.payload)
                ? Result.fail(new ImageAttachmentRejected({ threadId: thread.threadId }))
                : Result.succeed(undefined),
            ),
            Result.map(() => thread),
          ),
        ),
        Result.map((thread) => {
          const providerHandoff =
            command.payload.provider !== undefined && command.payload.provider !== thread.provider
              ? {
                  previousProvider: thread.provider,
                  provider: command.payload.provider,
                  previousModelSelection: thread.modelSelection,
                  modelSelection: command.payload.modelSelection ?? null,
                }
              : undefined
          let started: Omit<ThreadTurnStarted, "_tag"> = {
            threadId: command.payload.threadId,
            turnId: TurnId.make(command.commandId),
            titleSeed:
              command.payload.titleSeed ??
              seedTitleFromTurn(command.payload.text, command.payload.attachments),
          }
          if (command.payload.text !== undefined) {
            started = Object.assign(started, { text: command.payload.text })
          }
          if (command.payload.attachments !== undefined) {
            started = Object.assign(started, { attachments: command.payload.attachments })
          }
          if (command.payload.runtimeMode !== undefined) {
            started = Object.assign(started, { runtimeMode: command.payload.runtimeMode })
          }
          if (command.payload.modelSelection !== undefined) {
            started = Object.assign(started, { modelSelection: command.payload.modelSelection })
          }
          if (command.payload.prepareWorktree !== undefined) {
            started = Object.assign(started, { prepareWorktree: command.payload.prepareWorktree })
          }
          if (providerHandoff !== undefined) {
            started = Object.assign(started, { providerHandoff })
          }
          const startedEvent = ThreadTurnStarted.make(started)
          const unsettle = activityUnsettle(thread)
          const events: Array<ThreadEvent> = unsettle === null ? [] : [unsettle]
          if (providerHandoff !== undefined) {
            events.push(
              ThreadProviderHandedOff.make({
                threadId: thread.threadId,
                ...providerHandoff,
              }),
            )
          }
          events.push(startedEvent)
          return events
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
          const sessionSet = ThreadSessionSet.make({
            threadId: thread.threadId,
            session,
          })
          const isSessionActivity = session.status === "starting" || session.status === "running"
          const unsettle = isSessionActivity ? activityUnsettle(thread) : null
          return Result.succeed(unsettle === null ? [sessionSet] : [unsettle, sessionSet])
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
                  const withError =
                    command.payload.lastError === undefined
                      ? ended
                      : Object.assign({}, ended, { lastError: command.payload.lastError })
                  const endedEvent =
                    command.payload.providerForkPoint === undefined
                      ? ThreadTurnEnded.make(withError)
                      : ThreadTurnEnded.make(
                          Object.assign(withError, {
                            providerForkPoint: command.payload.providerForkPoint,
                          }),
                        )
                  return [
                    endedEvent,
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
    case "thread.turn.diff.complete":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) => {
          const turn = thread.turns.find((candidate) => candidate.turnId === command.payload.turnId)
          if (turn === undefined) {
            return Result.fail(
              new TurnNotFound({
                threadId: thread.threadId,
                turnId: command.payload.turnId,
              }),
            )
          }
          if (turn.turnDiff?.status === "ready") {
            return Result.succeed([])
          }
          return Result.succeed([ThreadTurnDiffCompleted.make(command.payload)])
        }),
      )
    case "thread.context-usage.set":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap((thread) => requireActiveThread(thread).pipe(Result.map(() => thread))),
        Result.map((thread) => {
          const next = command.payload.contextUsage
          const current = thread.contextUsage
          if (current !== null && current.used === next.used && current.window === next.window) {
            return []
          }
          return [ThreadContextUsageSet.make(command.payload)]
        }),
      )
    case "thread.fork.complete":
      return requireThread(state, command.payload.threadId).pipe(
        Result.flatMap(
          (destination): Result.Result<ReadonlyArray<ThreadEvent>, ThreadDecisionError> => {
            if (
              destination.forkOrigin?.sourceThreadId !== command.payload.sourceThreadId ||
              destination.forkOrigin.sourceTurnId !== command.payload.sourceTurnId
            ) {
              return Result.fail(
                new ThreadForkOriginMismatch({
                  threadId: destination.threadId,
                  sourceThreadId: command.payload.sourceThreadId,
                  sourceTurnId: command.payload.sourceTurnId,
                }),
              )
            }
            return requireThread(state, command.payload.sourceThreadId).pipe(
              Result.map(() => [
                ThreadForkCompleted.make({
                  threadId: command.payload.threadId,
                  sourceThreadId: command.payload.sourceThreadId,
                  sourceTurnId: command.payload.sourceTurnId,
                  session: {
                    threadId: command.payload.threadId,
                    status: "ready",
                    lastError: null,
                    activeTurnId: null,
                    runtimeMode: destination.runtimeMode,
                    resumeCursor: command.payload.resumeCursor,
                    updatedAt: command.issuedAt,
                  },
                }),
              ]),
            )
          },
        ),
      )
    case "thread.fork.fail":
      return Result.succeed([
        ThreadForkFailed.make({
          threadId: command.payload.threadId,
          sourceThreadId: command.payload.sourceThreadId,
          sourceTurnId: command.payload.sourceTurnId,
          detail: command.payload.detail,
        }),
      ])
  }
}
