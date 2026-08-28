import type * as AcpSchema from "@noyau/acp/schema"
import type { BoardSnapshot } from "@noyau/contracts/board"
import { composerPromptSegments } from "@noyau/shared/composer-inline-tokens"
import { Effect, Option, Path } from "effect"

export interface PromptTicket {
  readonly ticketId: string
  readonly title: string
  readonly description?: string | undefined
  readonly columnName: string
  readonly done: boolean
}

const isInsideWorkspace = (
  path: Path.Path,
  workspaceRoot: string,
  absolutePath: string,
): boolean => {
  const relative = path.relative(path.resolve(workspaceRoot), path.resolve(absolutePath))
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  )
}

const resolveMentionPath = (
  path: Path.Path,
  workspaceRoot: string,
  mentionPath: string,
): string | null => {
  const trimmed = mentionPath.trim()
  if (trimmed.length === 0) {
    return null
  }
  const absolute = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(workspaceRoot, trimmed)
  return isInsideWorkspace(path, workspaceRoot, absolute) ? absolute : null
}

export const promptTicketsFromBoard = (snapshot: BoardSnapshot): ReadonlyArray<PromptTicket> => {
  const columnsById = new Map(snapshot.columns.map((column) => [column.id, column]))
  return snapshot.tickets.map((ticket) => {
    const column = columnsById.get(ticket.columnId)
    const base = {
      ticketId: ticket.id,
      title: ticket.title,
      columnName: column?.name ?? ticket.columnId,
      done: ticket.done,
    }
    return ticket.description === undefined ? base : { ...base, description: ticket.description }
  })
}

export const formatTicketPromptText = (ticket: PromptTicket): string => {
  const lines = [
    `Ticket « ${ticket.title} »`,
    `ticketId: ${ticket.ticketId}`,
    `column: ${ticket.columnName}`,
    `done: ${ticket.done ? "true" : "false"}`,
  ]
  if (ticket.description !== undefined && ticket.description.trim() !== "") {
    lines.push("", ticket.description)
  }
  return lines.join("\n")
}

export const promptContentBlocks = Effect.fn("promptContentBlocks")(function* (
  text: string,
  workspaceRoot: string,
  tickets: ReadonlyArray<PromptTicket> = [],
) {
  const path = yield* Path.Path
  const ticketsById = new Map(tickets.map((ticket) => [ticket.ticketId, ticket]))
  const blocks: Array<AcpSchema.ContentBlock> = []
  let pendingText = ""

  const flushText = () => {
    if (pendingText.length > 0) {
      blocks.push({ type: "text", text: pendingText })
      pendingText = ""
    }
  }

  for (const segment of composerPromptSegments(text)) {
    if (segment.type === "text") {
      pendingText += segment.text
      continue
    }
    if (segment.type === "ticket") {
      const ticket = ticketsById.get(segment.ticketId)
      if (ticket === undefined) {
        pendingText += segment.source
        continue
      }
      flushText()
      blocks.push({ type: "text", text: formatTicketPromptText(ticket) })
      continue
    }
    const absolute = resolveMentionPath(path, workspaceRoot, segment.path)
    if (absolute === null) {
      pendingText += segment.source
      continue
    }
    const fileUrl = yield* path.toFileUrl(absolute).pipe(Effect.option)
    if (Option.isNone(fileUrl)) {
      pendingText += segment.source
      continue
    }
    flushText()
    blocks.push({
      type: "resource_link",
      name: path.basename(absolute),
      uri: fileUrl.value.href,
    })
  }
  flushText()
  if (blocks.length === 0) {
    blocks.push({ type: "text", text })
  }
  return blocks
})
