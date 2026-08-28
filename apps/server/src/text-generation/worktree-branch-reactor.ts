import type { TranscriptItem } from "@noyau/contracts/entities/transcript"
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
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { readThreadSnapshot } from "@noyau/server/persistence/snapshots"
import { Crypto, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { TextGeneration } from "./text-generation.ts"

const decodeThreadMetaUpdate = Schema.decodeUnknownEffect(ThreadMetaUpdate)
const systemActor = ActorId.make("system:cursor")
const isThreadEvent = Schema.is(ThreadEvent)

export type DispatchInternal = (command: (typeof ThreadMetaUpdate)["Type"]) => Effect.Effect<void>

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

  const snapshot = yield* readThreadSnapshot(input.threadId).pipe(Effect.orDie)
  if (Option.isNone(snapshot) || snapshot.value.thread.branch !== branch) {
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
})

/** Maps a first-turn worktree bind to a generated `noyau/<slug>` ref. */
export const makeWorktreeBranchReactor = (
  dispatchInternal: DispatchInternal,
): Effect.Effect<
  (persisted: PersistedEvent<DomainEvent>) => Effect.Effect<void>,
  never,
  TextGeneration | SqlClient | Crypto.Crypto | GitRuntime
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const textGeneration = yield* TextGeneration
    const git = yield* GitRuntime

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
            const snapshot = yield* readThreadSnapshot(threadEvent.threadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (Option.isNone(snapshot) || snapshot.value.turns.length !== 1) {
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
              branch: snapshot.value.thread.branch ?? null,
              worktreePath: snapshot.value.thread.worktreePath ?? null,
              message,
            })
          })
        case "thread.meta-updated":
          if (threadEvent.branch === undefined && threadEvent.worktreePath === undefined) {
            return Effect.void
          }
          return Effect.gen(function* () {
            const snapshot = yield* readThreadSnapshot(threadEvent.threadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (Option.isNone(snapshot) || snapshot.value.turns.length !== 1) {
              return
            }
            yield* run(persisted, {
              threadId: threadEvent.threadId,
              branch: snapshot.value.thread.branch ?? null,
              worktreePath: snapshot.value.thread.worktreePath ?? null,
              message: firstUserMessage(snapshot.value.transcript),
            })
          })
        default:
          return Effect.void
      }
    }
  })
