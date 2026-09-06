import {
  InternalCommand,
  type InternalCommand as InternalCommandType,
} from "@noyau/contracts/commands"
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
import { ThreadEvent } from "@noyau/contracts/thread/events"
import {
  canReplaceThreadTitle,
  DEFAULT_THREAD_TITLE,
  sanitizeThreadTitle,
  seedTitleFromTurn,
} from "@noyau/contracts/thread/title"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { readThreadSnapshot } from "@noyau/server/persistence/snapshots"
import { Crypto, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { TextGeneration, type ThreadTitleGenerationInput } from "./text-generation.ts"

const ProjectRootRow = Schema.Struct({ workspace_root: Schema.NonEmptyString })
const decodeProjectRootRow = Schema.decodeEffect(ProjectRootRow)
const ThreadTitleContextRow = Schema.Struct({
  title: Schema.String,
  has_turn: Schema.Int,
  has_second_turn: Schema.Int,
})
const ThreadTitleRow = Schema.Struct({ title: Schema.String })
const decodeThreadTitleContextRow = Schema.decodeEffect(ThreadTitleContextRow)
const decodeThreadTitleRow = Schema.decodeEffect(ThreadTitleRow)
const decodeInternalCommand = Schema.decodeUnknownEffect(InternalCommand)
const systemActor = ActorId.make("system:cursor")
const isThreadEvent = Schema.is(ThreadEvent)

export type DispatchInternal = (command: InternalCommandType) => Effect.Effect<void>

const projectRoot = Effect.fn("ThreadTitleReactor.projectRoot")(function* (projectId: string) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof ProjectRootRow)["Encoded"]
  >`SELECT workspace_root FROM projection_projects WHERE project_id = ${projectId}`.pipe(
    Effect.orDie,
  )
  const row = rows[0]
  if (row === undefined) {
    return yield* Effect.die(`Projection project ${projectId} has no WorkspaceRoot`)
  }
  return (yield* decodeProjectRootRow(row).pipe(Effect.orDie)).workspace_root
})

const readThreadTitleContext = Effect.fn("ThreadTitleReactor.readThreadTitleContext")(function* (
  threadId: ThreadId,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<(typeof ThreadTitleContextRow)["Encoded"]>`
    SELECT
      thread.title,
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
    : Option.some(yield* decodeThreadTitleContextRow(row).pipe(Effect.orDie))
})

const readThreadTitle = Effect.fn("ThreadTitleReactor.readThreadTitle")(function* (
  threadId: ThreadId,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<(typeof ThreadTitleRow)["Encoded"]>`
    SELECT title
    FROM projection_threads
    WHERE thread_id = ${threadId}
  `
  const row = rows[0]
  return row === undefined
    ? Option.none()
    : Option.some(yield* decodeThreadTitleRow(row).pipe(Effect.orDie))
})

const makeTitleSeededCommand = Effect.fn("ThreadTitleReactor.makeTitleSeededCommand")(function* (
  persisted: PersistedEvent<DomainEvent>,
  threadId: ThreadId,
  title: string,
) {
  const crypto = yield* Crypto.Crypto
  const commandId = yield* crypto.randomUUIDv4.pipe(Effect.orDie)
  const issuedAt = yield* DateTime.now
  return yield* decodeInternalCommand({
    _tag: "thread.title.seeded",
    commandId: CommandId.make(commandId),
    projectId: ProjectId.make(persisted.projectId),
    actorId: systemActor,
    correlationId: CorrelationId.make(persisted.correlationId),
    causationId: EventId.make(persisted.eventId),
    issuedAt: DateTime.formatIso(issuedAt),
    schemaVersion: 1,
    payload: { threadId, title },
  }).pipe(Effect.orDie)
})

const formatThreadTitleContext = (items: ReadonlyArray<TranscriptItem>): string =>
  items
    .flatMap((item) => {
      switch (item._tag) {
        case "transcript.user": {
          const parts = [
            item.text,
            item.attachments?.map((attachment) => `[image: ${attachment.name}]`).join(" "),
          ].filter((part): part is string => part !== undefined && part.trim().length > 0)
          return parts.length === 0 ? [] : [`USER: ${parts.join(" ")}`]
        }
        case "transcript.assistant":
          return item.text.trim() === "" ? [] : [`ASSISTANT: ${item.text}`]
        default:
          return []
      }
    })
    .join("\n\n")

const applyGeneratedTitle = Effect.fn("ThreadTitleReactor.applyGeneratedTitle")(function* (
  dispatchInternal: DispatchInternal,
  persisted: PersistedEvent<DomainEvent>,
  input: {
    readonly threadId: ThreadId
    readonly cwd: string
    readonly message: string
    readonly titleSeed?: string
    readonly previousTitle?: string
    readonly replaceable: boolean
  },
) {
  if (!input.replaceable || input.message.trim() === "") {
    return
  }
  const textGeneration = yield* TextGeneration
  let generationInput: ThreadTitleGenerationInput = {
    cwd: input.cwd,
    message: input.message,
  }
  if (input.previousTitle !== undefined) {
    generationInput = Object.assign(generationInput, { previousTitle: input.previousTitle })
  }
  const generated = yield* textGeneration.generateThreadTitle(generationInput).pipe(
    Effect.catch((error) =>
      Effect.logWarning("thread title generation failed", {
        threadId: input.threadId,
        detail: error.detail,
      }).pipe(Effect.as(undefined)),
    ),
  )
  if (generated === undefined) {
    return
  }
  const title = sanitizeThreadTitle(generated.title)
  if (title === DEFAULT_THREAD_TITLE || title === input.previousTitle) {
    return
  }

  const thread = yield* readThreadTitle(input.threadId).pipe(Effect.orDie)
  if (Option.isNone(thread)) {
    return
  }
  if (input.previousTitle !== undefined && thread.value.title !== input.previousTitle) {
    return
  }
  if (
    input.previousTitle === undefined &&
    !canReplaceThreadTitle(thread.value.title, input.titleSeed)
  ) {
    return
  }

  const command = yield* makeTitleSeededCommand(persisted, input.threadId, title)
  yield* dispatchInternal(command)
})

/** Maps committed Thread facts to an async title generation, then a `thread.title.seeded`. */
export const makeThreadTitleReactor = (
  dispatchInternal: DispatchInternal,
): Effect.Effect<
  (persisted: PersistedEvent<DomainEvent>) => Effect.Effect<void>,
  never,
  TextGeneration | SqlClient | Crypto.Crypto
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient
    const crypto = yield* Crypto.Crypto
    const textGeneration = yield* TextGeneration

    return (persisted) => {
      const event = persisted.event
      if (!isThreadEvent(event)) {
        return Effect.void
      }
      const threadEvent = event
      switch (threadEvent._tag) {
        case "thread.turn.started":
          return Effect.gen(function* () {
            const context = yield* readThreadTitleContext(threadEvent.threadId).pipe(
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
            const titleSeed =
              threadEvent.titleSeed ?? seedTitleFromTurn(threadEvent.text, threadEvent.attachments)
            const message =
              threadEvent.text ??
              threadEvent.attachments
                ?.map((attachment) => `[image: ${attachment.name}]`)
                .join(" ") ??
              ""
            if (message.trim() === "" || !canReplaceThreadTitle(context.value.title, titleSeed)) {
              return
            }
            const cwd = yield* projectRoot(persisted.projectId).pipe(
              Effect.provideService(SqlClient, sql),
            )
            yield* applyGeneratedTitle(dispatchInternal, persisted, {
              threadId: threadEvent.threadId,
              cwd,
              message,
              titleSeed,
              replaceable: true,
            }).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.provideService(Crypto.Crypto, crypto),
              Effect.provideService(TextGeneration, textGeneration),
            )
          })
        case "thread.meta-updated":
          if (threadEvent.regenerateTitle !== true) {
            return Effect.void
          }
          return Effect.gen(function* () {
            const snapshot = yield* readThreadSnapshot(threadEvent.threadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (Option.isNone(snapshot)) {
              return
            }
            const message = formatThreadTitleContext(snapshot.value.transcript)
            const cwd = yield* projectRoot(persisted.projectId).pipe(
              Effect.provideService(SqlClient, sql),
            )
            yield* applyGeneratedTitle(dispatchInternal, persisted, {
              threadId: threadEvent.threadId,
              cwd,
              message,
              previousTitle: snapshot.value.thread.title,
              replaceable: message.trim() !== "",
            }).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.provideService(Crypto.Crypto, crypto),
              Effect.provideService(TextGeneration, textGeneration),
            )
          })
        default:
          return Effect.void
      }
    }
  })
