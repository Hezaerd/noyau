import type { ClientCommandRequest, Command as CommandType } from "@noyau/contracts/commands"
import { Command } from "@noyau/contracts/commands"
import { ServiceUnavailable } from "@noyau/contracts/errors"
import {
  type ActorId,
  CorrelationId,
  KanbanColumnId,
  ProjectId,
  type ProjectId as ProjectIdType,
} from "@noyau/contracts/ids"
import { WorkspaceRootNotDirectory, WorkspaceRootNotFound } from "@noyau/contracts/project/errors"
import { Crypto, DateTime, Effect, FileSystem, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

import { persistTurnUploads } from "./attachments.ts"

const ScopeRow = Schema.Struct({ project_id: Schema.String })
const decodeScopeRow = Schema.decodeEffect(ScopeRow)
const decodeCommand = Schema.decodeUnknownEffect(Command)

const fallbackProjectId = (id: string): ProjectIdType => ProjectId.make(id)

const projectForTicket = Effect.fn("CommandFromRequest.projectForTicket")(function* (
  ticketId: string,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof ScopeRow)["Encoded"]
  >`SELECT project_id FROM projection_tickets WHERE ticket_id = ${ticketId}`
  const row = rows[0]
  return row === undefined
    ? fallbackProjectId(ticketId)
    : ProjectId.make((yield* decodeScopeRow(row).pipe(Effect.orDie)).project_id)
})

const projectForColumn = Effect.fn("CommandFromRequest.projectForColumn")(function* (
  columnId: string,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof ScopeRow)["Encoded"]
  >`SELECT project_id FROM projection_columns WHERE column_id = ${columnId}`
  const row = rows[0]
  return row === undefined
    ? fallbackProjectId(columnId)
    : ProjectId.make((yield* decodeScopeRow(row).pipe(Effect.orDie)).project_id)
})

const projectForThread = Effect.fn("CommandFromRequest.projectForThread")(function* (
  threadId: string,
) {
  const sql = yield* SqlClient
  const rows = yield* sql<
    (typeof ScopeRow)["Encoded"]
  >`SELECT project_id FROM projection_threads WHERE thread_id = ${threadId}`
  const row = rows[0]
  return row === undefined
    ? fallbackProjectId(threadId)
    : ProjectId.make((yield* decodeScopeRow(row).pipe(Effect.orDie)).project_id)
})

export const requestProjectId = Effect.fn("CommandFromRequest.requestProjectId")(function* (
  request: ClientCommandRequest,
) {
  switch (request._tag) {
    case "project.create":
    case "project.meta.update":
    case "project.rebind":
    case "project.delete":
    case "ticket.create":
    case "thread.create":
      return request.payload.projectId
    case "thread.fork":
      return yield* projectForThread(request.payload.sourceThreadId)
    case "kanbanColumn.create":
      return request.payload.projectId
    case "kanbanColumn.update":
    case "kanbanColumn.move":
    case "kanbanColumn.delete":
      return yield* projectForColumn(request.payload.columnId)
    case "ticket.move":
    case "ticket.complete":
    case "ticket.reopen":
    case "ticket.archive":
    case "ticket.restore":
    case "ticket.assign":
    case "ticket.update":
    case "ticket.dependency.add":
    case "ticket.dependency.remove":
    case "ticket.thread.link":
    case "ticket.thread.unlink":
      return yield* projectForTicket(request.payload.ticketId)
    case "thread.delete":
    case "thread.settle":
    case "thread.unsettle":
    case "thread.meta.update":
    case "thread.runtime-mode.set":
    case "thread.model-selection.set":
    case "thread.turn.start":
    case "thread.turn.interrupt":
    case "approval.respond":
    case "user-input.respond":
    case "session.stop":
      return yield* projectForThread(request.payload.threadId)
  }
})

const columnIdFromDigest = (digest: Uint8Array) => {
  const bytes = digest.slice(0, 16)
  const versionByte = bytes[6]
  const variantByte = bytes[8]
  if (versionByte === undefined || variantByte === undefined) {
    throw new Error("SHA-256 digest is shorter than 16 bytes")
  }
  bytes[6] = (versionByte & 0x0f) | 0x50
  bytes[8] = (variantByte & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
  return KanbanColumnId.make(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  )
}

const initialBoardFor = Effect.fn("CommandFromRequest.initialBoardFor")(function* (
  commandId: string,
) {
  const crypto = yield* Crypto.Crypto
  const encoder = new TextEncoder()
  const derive = (role: "active" | "backlog" | "done") =>
    crypto
      .digest("SHA-256", encoder.encode(`board:${role}:${commandId}`))
      .pipe(Effect.map(columnIdFromDigest))
  const [backlogColumnId, activeColumnId, doneColumnId] = yield* Effect.all([
    derive("backlog"),
    derive("active"),
    derive("done"),
  ])
  return { backlogColumnId, activeColumnId, doneColumnId }
})

/**
 * Pre-transaction filesystem stat. Missing and not-a-directory are not
 * journaled: the path can change between this check and the worker.
 */
const validateWorkspaceRoot = Effect.fn("CommandFromRequest.validateWorkspaceRoot")(function* (
  command: CommandType,
) {
  if (command._tag !== "project.create" && command._tag !== "project.rebind") {
    return
  }
  const workspaceRoot = command.payload.workspaceRoot
  const fileSystem = yield* FileSystem.FileSystem
  const result = yield* fileSystem.stat(workspaceRoot).pipe(
    Effect.map((info) => ({ _tag: "Found" as const, info })),
    Effect.catchTag("PlatformError", (error) =>
      error.reason._tag === "NotFound"
        ? Effect.succeed({ _tag: "Missing" as const })
        : Effect.fail(new ServiceUnavailable({ service: "filesystem" })),
    ),
  )
  if (result._tag === "Missing") {
    return yield* new WorkspaceRootNotFound({ workspaceRoot })
  }
  if (result.info.type !== "Directory") {
    return yield* new WorkspaceRootNotDirectory({ workspaceRoot })
  }
})

const enrichCommand = Effect.fn("CommandFromRequest.enrichCommand")(function* (
  request: ClientCommandRequest,
  actorId: ActorId,
) {
  const projectId = yield* requestProjectId(request)
  const issuedAt = yield* DateTime.now
  const attachments =
    request._tag === "thread.turn.start" ? yield* persistTurnUploads(request) : undefined
  const enrichedRequest =
    request._tag === "project.create"
      ? {
          ...request,
          initialBoard: yield* initialBoardFor(request.commandId).pipe(
            Effect.mapError(() => new ServiceUnavailable({ service: "crypto" })),
          ),
        }
      : request._tag === "thread.turn.start" && attachments !== undefined
        ? { ...request, payload: { ...request.payload, attachments } }
        : request
  return yield* decodeCommand({
    ...enrichedRequest,
    projectId,
    actorId,
    correlationId: CorrelationId.make(request.commandId),
    issuedAt: DateTime.formatIso(issuedAt),
    schemaVersion: 1,
  }).pipe(Effect.orDie)
})

/** Client request → Command: scope, board identity, uploads, actor, workspace-root FS check. */
export const commandFromRequest = Effect.fn("CommandFromRequest.commandFromRequest")(function* (
  request: ClientCommandRequest,
  actorId: ActorId,
) {
  const command = yield* enrichCommand(request, actorId)
  yield* validateWorkspaceRoot(command)
  return command
})
