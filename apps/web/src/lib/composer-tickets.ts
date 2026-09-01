import type { AgentSkillEntry } from "@noyau/contracts/entities/agent-skill"

export const EMPTY_COMPOSER_TICKETS: ReadonlyArray<ComposerTicket> = []
export const EMPTY_COMPOSER_SKILLS: ReadonlyArray<AgentSkillEntry> = []

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
  | ({ readonly kind: "skill" } & AgentSkillEntry)

const normalizeMentionQuery = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
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
    return left.title.localeCompare(right.title, "en")
  })
}

export const composerTicketById = (
  tickets: ReadonlyArray<ComposerTicket>,
  ticketId: string,
): ComposerTicket | undefined => tickets.find((ticket) => ticket.ticketId === ticketId)

export const filterComposerSkills = (
  skills: ReadonlyArray<AgentSkillEntry>,
  query: string,
): ReadonlyArray<AgentSkillEntry> => {
  const normalizedQuery = normalizeMentionQuery(query)
  const matching =
    normalizedQuery === ""
      ? skills
      : skills.filter(
          (skill) =>
            normalizeMentionQuery(skill.name).includes(normalizedQuery) ||
            normalizeMentionQuery(skill.displayName).includes(normalizedQuery) ||
            normalizeMentionQuery(skill.description ?? "").includes(normalizedQuery),
        )
  return matching.toSorted(
    (left, right) =>
      left.displayName.localeCompare(right.displayName, "en") ||
      left.name.localeCompare(right.name),
  )
}

export const composerSkillByName = (
  skills: ReadonlyArray<AgentSkillEntry>,
  name: string,
): AgentSkillEntry | undefined => skills.find((skill) => skill.name === name)

export const buildComposerSkillEntries = (
  skills: ReadonlyArray<AgentSkillEntry>,
): ReadonlyArray<ComposerMentionEntry> => skills.map((skill) => ({ kind: "skill", ...skill }))

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
