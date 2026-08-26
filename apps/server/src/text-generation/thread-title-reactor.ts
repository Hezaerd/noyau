import {
  InternalCommand,
  type InternalCommand as InternalCommandType,
} from "@noyau/protocol/commands"
import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type { DomainEvent } from "@noyau/protocol/events"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  ProjectId,
  type ThreadId,
} from "@noyau/protocol/ids"
import { ThreadEvent } from "@noyau/protocol/thread/events"
import {
  canReplaceThreadTitle,
  DEFAULT_THREAD_TITLE,
  sanitizeThreadTitle,
  seedTitleFromTurn,
} from "@noyau/protocol/thread/title"
import type { PersistedEvent } from "@noyau/server/persistence/command-worker"
import { readThreadSnapshot } from "@noyau/server/persistence/snapshots"
import { Crypto, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { TextGeneration, type ThreadTitleGenerationInput } from "./text-generation.ts"

const ProjectRootRow = Schema.Struct({ workspace_root: Schema.NonEmptyString })
const decodeProjectRootRow = Schema.decodeEffect(ProjectRootRow)
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

  const snapshot = yield* readThreadSnapshot(input.threadId).pipe(Effect.orDie)
  if (Option.isNone(snapshot)) {
    return
  }
  if (input.previousTitle !== undefined && snapshot.value.thread.title !== input.previousTitle) {
    return
  }
  if (
    input.previousTitle === undefined &&
    !canReplaceThreadTitle(snapshot.value.thread.title, input.titleSeed)
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
            const snapshot = yield* readThreadSnapshot(threadEvent.threadId).pipe(
              Effect.provideService(SqlClient, sql),
              Effect.orDie,
            )
            if (Option.isNone(snapshot) || snapshot.value.turns.length !== 1) {
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
            if (
              message.trim() === "" ||
              !canReplaceThreadTitle(snapshot.value.thread.title, titleSeed)
            ) {
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
