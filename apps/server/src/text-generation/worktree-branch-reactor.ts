import { TranscriptItem } from "@noyau/contracts/entities/transcript"
import type { DomainEvent } from "@noyau/contracts/events"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  ProjectId,
  type ThreadId,
} from "@noyau/contracts/ids"
import { ThreadMetaUpdate } from "@noyau/contracts/thread/commands"
import { ThreadEvent } from "@noyau/contracts/thread/events"
import {
  buildGeneratedWorktreeBranchName,
  GitRuntime,
  isTemporaryWorktreeBranch,
} from "@noyau/server/git/git-runtime"
import { VcsStatusBroadcaster } from "@noyau/server/git/vcs-status-broadcaster"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { Crypto, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { TextGeneration } from "./text-generation.ts"

const decodeThreadMetaUpdate = Schema.decodeUnknownEffect(ThreadMetaUpdate)
const WorktreeBranchContextRow = Schema.Struct({
  branch: Schema.NullOr(Schema.String),
  worktree_path: Schema.NullOr(Schema.String),
  has_turn: Schema.Int,
  has_second_turn: Schema.Int,
})
const WorktreeBranchRow = Schema.Struct({ branch: Schema.NullOr(Schema.String) })
const TranscriptRow = Schema.Struct({ item: Schema.String })
const decodeWorktreeBranchContextRow = Schema.decodeEffect(WorktreeBranchContextRow)
const decodeWorktreeBranchRow = Schema.decodeEffect(WorktreeBranchRow)
const decodeTranscriptRow = Schema.decodeEffect(TranscriptRow)
const decodeTranscriptItem = Schema.decodeEffect(Schema.fromJsonString(TranscriptItem))
const systemActor = ActorId.make("system:cursor")
const isThreadEvent = Schema.is(ThreadEvent)

export type DispatchInternal = (command: (typeof ThreadMetaUpdate)["Type"]) => Effect.Effect<void>

const readWorktreeBranchContext = Effect.fn("WorktreeBranchReactor.readWorktreeBranchContext")(
  function* (threadId: ThreadId) {
    const sql = yield* SqlClient
    const rows = yield* sql<(typeof WorktreeBranchContextRow)["Encoded"]>`
      SELECT
        thread.branch,
        thread.worktree_path,
        EXISTS (
          SELECT 1
          FROM projection_turns AS first_turn
          WHERE first_turn.thread_id = thread.thread_id
          LIMIT 1
        ) AS has_turn,
        EXISTS (
          SELECT 1
          FROM projection_turns AS second_turn
          WHERE second_turn.thread_id = thread.thread_id
          ORDER BY second_turn.ordinal
          LIMIT 1 OFFSET 1
        ) AS has_second_turn
      FROM projection_threads AS thread
      WHERE thread.thread_id = ${threadId}
    `
    const row = rows[0]
    return row === undefined
      ? Option.none()
      : Option.some(yield* decodeWorktreeBranchContextRow(row).pipe(Effect.orDie))
  },
)

const readThreadBranch = Effect.fn("WorktreeBranchReactor.readThreadBranch")(function* (
  threadId: ThreadId,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<(typeof WorktreeBranchRow)["Encoded"]>`
    SELECT branch
    FROM projection_threads
    WHERE thread_id = ${threadId}
  `
  const row = rows[0]
  return row === undefined
    ? Option.none()
    : Option.some(yield* decodeWorktreeBranchRow(row).pipe(Effect.orDie))
})

const readFirstUserMessage = Effect.fn("WorktreeBranchReactor.readFirstUserMessage")(function* (
  threadId: ThreadId,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<(typeof TranscriptRow)["Encoded"]>`
    SELECT item
    FROM projection_transcript
    WHERE thread_id = ${threadId}
      AND kind = 'transcript.user'
    ORDER BY ordinal
  `
  const items = yield* Effect.forEach(rows, (raw) =>
    decodeTranscriptRow(raw).pipe(
      Effect.orDie,
      Effect.flatMap((row) => decodeTranscriptItem(row.item).pipe(Effect.orDie)),
    ),
  )
  return firstUserMessage(items)
})

const firstUserMessage = (items: ReadonlyArray<TranscriptItem>): string => {
  for (const item of items) {
    if (item._tag !== "transcript.user") {
      continue
    }
    const parts = [
      item.text,
      item.attachments?.map((attachment) => `[image: ${attachment.name}]`).join(" "),
    ].filter((part): part is string => part !== undefined && part.trim().length > 0)
    if (parts.length > 0) {
      return parts.join(" ")
    }
  }
  return ""
}

const makeCheckoutCommand = Effect.fn("WorktreeBranchReactor.makeCheckoutCommand")(function* (
  persisted: PersistedEvent<DomainEvent>,
  input: {
    readonly threadId: ThreadId
    readonly branch: string
    readonly worktreePath: string
  },
) {
  const crypto = yield* Crypto.Crypto
  const commandId = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
  const issuedAt = yield* DateTime.now
  return yield* decodeThreadMetaUpdate({
    _tag: "thread.meta.update",
    commandId: CommandId.make(commandId),
    projectId: ProjectId.make(persisted.projectId),
    actorId: systemActor,
    correlationId: CorrelationId.make(persisted.correlationId),
    causationId: EventId.make(persisted.eventId),
    issuedAt: DateTime.formatIso(issuedAt),
    schemaVersion: 1,
    payload: {
      threadId: input.threadId,
      branch: input.branch,
      worktreePath: input.worktreePath,
    },
  }).pipe(Effect.orDie)
})

const maybeRenameTemporaryWorktreeBranch = Effect.fn(
  "WorktreeBranchReactor.maybeRenameTemporaryWorktreeBranch",
)(function* (
  dispatchInternal: DispatchInternal,
  persisted: PersistedEvent<DomainEvent>,
  input: {
    readonly threadId: ThreadId
    readonly branch: string | null
    readonly worktreePath: string | null
    readonly message: string
  },
) {
  const branch = input.branch
  const worktreePath = input.worktreePath
  if (branch === null || worktreePath === null || !isTemporaryWorktreeBranch(branch)) {
    return
  }
  if (input.message.trim() === "") {
    return
  }

  const textGeneration = yield* TextGeneration
  const generated = yield* textGeneration
    .generateBranchName({
      cwd: worktreePath,
      message: input.message,
    })
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("worktree branch generation failed", {
          threadId: input.threadId,
          detail: error.detail,
        }).pipe(Effect.as(undefined)),
      ),
    )
  if (generated === undefined) {
    return
  }

  const targetBranch = buildGeneratedWorktreeBranchName(generated.branch)
  if (targetBranch === branch) {
    return
  }

  const current = yield* readThreadBranch(input.threadId).pipe(Effect.orDie)
  if (Option.isNone(current) || current.value.branch !== branch) {
    return
  }

  const git = yield* GitRuntime
  const renamed = yield* git
    .renameBranch({
      cwd: worktreePath,
      oldBranch: branch,
      newBranch: targetBranch,
    })
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("worktree branch rename failed", {
          threadId: input.threadId,
          oldBranch: branch,
          newBranch: targetBranch,
          detail: error.detail,
        }).pipe(Effect.as(undefined)),
      ),
    )
  if (renamed === undefined) {
    return
  }

  const command = yield* makeCheckoutCommand(persisted, {
    threadId: input.threadId,
    branch: renamed.branch,
    worktreePath,
  })
  yield* dispatchInternal(command)
  const broadcaster = yield* VcsStatusBroadcaster
  yield* broadcaster.refresh(worktreePath).pipe(Effect.ignore)
})

/** Maps a first-turn worktree bind to a generated `noyau/<slug>` ref. */
export const makeWorktreeBranchReactor = (
  dispatchInternal: DispatchInternal,
): Effect.Effect<
  (persisted: PersistedEvent<DomainEvent>) => Effect.Effect<void>,
  never,
  TextGeneration | SqlClient | Crypto.Crypto | GitRuntime | VcsStatusBroadcaster
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const textGeneration = yield* TextGeneration
    const git = yield* GitRuntime
    const broadcaster = yield* VcsStatusBroadcaster

    const run = (
      persisted: PersistedEvent<DomainEvent>,
      input: {
        readonly threadId: ThreadId
        readonly branch: string | null
        readonly worktreePath: string | null
        readonly message: string
      },
    ) =>
      maybeRenameTemporaryWorktreeBranch(dispatchInternal, persisted, input).pipe(
        Effect.provideService(SqlClient, sql),
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.provideService(TextGeneration, textGeneration),
        Effect.provideService(GitRuntime, git),
        Effect.provideService(VcsStatusBroadcaster, broadcaster),
      )

    return (persisted) => {
      const event = persisted.event
      if (!isThreadEvent(event)) {
        return Effect.void
      }
      const threadEvent = event
      switch (threadEvent._tag) {
        case "thread.turn.started":
          return Effect.gen(function* () {
            const context = yield* readWorktreeBranchContext(threadEvent.threadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (
              Option.isNone(context) ||
              context.value.has_turn !== 1 ||
              context.value.has_second_turn !== 0
            ) {
              return
            }
            const message =
              threadEvent.text ??
              threadEvent.attachments
                ?.map((attachment) => `[image: ${attachment.name}]`)
                .join(" ") ??
              ""
            yield* run(persisted, {
              threadId: threadEvent.threadId,
              branch: context.value.branch,
              worktreePath: context.value.worktree_path,
              message,
            })
          })
        case "thread.meta-updated":
          if (threadEvent.branch === undefined && threadEvent.worktreePath === undefined) {
            return Effect.void
          }
          return Effect.gen(function* () {
            const eligible = yield* sql
              .withTransaction(
                Effect.gen(function* () {
                  const context = yield* readWorktreeBranchContext(threadEvent.threadId)
                  if (
                    Option.isNone(context) ||
                    context.value.has_turn !== 1 ||
                    context.value.has_second_turn !== 0
                  ) {
                    return Option.none()
                  }
                  const message = yield* readFirstUserMessage(threadEvent.threadId)
                  return Option.some({ context: context.value, message })
                }).pipe(Effect.provideService(SqlClient, sql)),
              )
              .pipe(Effect.orDie)
            if (Option.isNone(eligible)) {
              return
            }
            yield* run(persisted, {
              threadId: threadEvent.threadId,
              branch: eligible.value.context.branch,
              worktreePath: eligible.value.context.worktree_path,
              message: eligible.value.message,
            })
          })
        default:
          return Effect.void
      }
    }
  })
