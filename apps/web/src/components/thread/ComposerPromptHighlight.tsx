import type { AgentSkillEntry } from "@noyau/contracts/entities/agent-skill"
import { composerPromptSegments } from "@noyau/shared/composer-inline-tokens"
import type { ComposerTrigger } from "@noyau/shared/composer-trigger"

import { ComposerFileChip } from "@/components/thread/ComposerFileChip"
import { ComposerSkillChip } from "@/components/thread/ComposerSkillChip"
import { ComposerTicketChip } from "@/components/thread/ComposerTicketChip"
import {
  composerSkillByName,
  composerTicketById,
  EMPTY_COMPOSER_SKILLS,
  EMPTY_COMPOSER_TICKETS,
  type ComposerTicket,
} from "@/lib/composer-tickets"
import { COMPOSER_FILE_CHIP_DECORATOR_CLASS_NAME } from "@/lib/file-chip"

const rangesOverlap = (
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean => leftStart < rightEnd && rightStart < leftEnd

export function ComposerPromptHighlight({
  text,
  trigger,
  tickets = EMPTY_COMPOSER_TICKETS,
  skills = EMPTY_COMPOSER_SKILLS,
}: {
  readonly text: string
  readonly trigger: ComposerTrigger | null
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly skills?: ReadonlyArray<AgentSkillEntry> | undefined
}) {
  const segments = composerPromptSegments(text)
  let offset = 0

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          offset += segment.text.length
          return <span key={`text-${String(index)}`}>{segment.text}</span>
        }

        const start = offset
        const end = start + segment.source.length
        offset = end
        const drafting =
          ((segment.type === "skill" && trigger?.kind === "skill") ||
            (segment.type !== "skill" && trigger?.kind === "path")) &&
          rangesOverlap(start, end, trigger.rangeStart, trigger.rangeEnd)
        if (drafting) {
          return <span key={`draft-${String(index)}`}>{segment.source}</span>
        }

        if (segment.type === "ticket") {
          const ticket = composerTicketById(tickets, segment.ticketId)
          return (
            <span
              key={`ticket-${String(index)}`}
              contentEditable={false}
              data-composer-mention="true"
              data-mention-source={segment.source}
              className={COMPOSER_FILE_CHIP_DECORATOR_CLASS_NAME}
            >
              <ComposerTicketChip title={ticket?.title ?? "Ticket"} />
            </span>
          )
        }

        if (segment.type === "skill") {
          const skill = composerSkillByName(skills, segment.name)
          if (skill === undefined) {
            return <span key={`skill-text-${String(index)}`}>{segment.source}</span>
          }
          return (
            <span
              key={`skill-${String(index)}`}
              contentEditable={false}
              data-composer-mention="true"
              data-mention-source={segment.source}
              className={COMPOSER_FILE_CHIP_DECORATOR_CLASS_NAME}
            >
              <ComposerSkillChip displayName={skill.displayName} />
            </span>
          )
        }

        return (
          <span
            key={`mention-${String(index)}`}
            contentEditable={false}
            data-composer-mention="true"
            data-mention-source={segment.source}
            className={COMPOSER_FILE_CHIP_DECORATOR_CLASS_NAME}
          >
            <ComposerFileChip path={segment.path} />
          </span>
        )
      })}
    </>
  )
}
