export const EMPTY_COMPOSER_TICKETS: ReadonlyArray<ComposerTicket> = []

export interface ComposerTicket {
  readonly ticketId: string
  readonly title: string
  readonly columnName: string
  readonly done: boolean
}

export type ComposerMentionEntry =
  | {
      readonly kind: "ticket"
      readonly ticketId: string
      readonly title: string
      readonly columnName: string
      readonly done: boolean
    }
  | {
      readonly kind: "file"
      readonly path: string
      readonly entryKind: "file" | "directory"
    }

const normalizeMentionQuery = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .trim()

export const filterComposerTickets = (
  tickets: ReadonlyArray<ComposerTicket>,
  query: string,
): ReadonlyArray<ComposerTicket> => {
  const normalizedQuery = normalizeMentionQuery(query)
  const matching =
    normalizedQuery === ""
      ? tickets
      : tickets.filter(
          (ticket) =>
            normalizeMentionQuery(ticket.title).includes(normalizedQuery) ||
            ticket.ticketId.startsWith(query.trim().toLowerCase()),
        )
  return matching.toSorted((left, right) => {
    if (left.done !== right.done) {
      return left.done ? 1 : -1
    }
    return left.title.localeCompare(right.title, "fr")
  })
}

export const composerTicketById = (
  tickets: ReadonlyArray<ComposerTicket>,
  ticketId: string,
): ComposerTicket | undefined => tickets.find((ticket) => ticket.ticketId === ticketId)

export const buildComposerMentionEntries = (
  tickets: ReadonlyArray<ComposerTicket>,
  files: ReadonlyArray<{ readonly path: string; readonly kind: "file" | "directory" }>,
): ReadonlyArray<ComposerMentionEntry> => [
  ...tickets.map((ticket) => ({
    kind: "ticket" as const,
    ticketId: ticket.ticketId,
    title: ticket.title,
    columnName: ticket.columnName,
    done: ticket.done,
  })),
  ...files.map((entry) => ({
    kind: "file" as const,
    path: entry.path,
    entryKind: entry.kind,
  })),
]
