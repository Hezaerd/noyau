import { TicketIcon } from "lucide-react"

import { FILE_CHIP_ICON_CLASS_NAME, TRANSCRIPT_FILE_CHIP_CLASS_NAME } from "@/lib/file-chip"
import { cn } from "@/lib/utils"

export function ThreadMarkdownTicketChip({
  ticketId,
  title,
  columnName,
  href,
  className,
  onOpenTicket,
}: {
  readonly ticketId: string
  readonly title: string
  readonly columnName?: string | undefined
  readonly href: string
  readonly className?: string | undefined
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined
}) {
  return (
    <a
      href={href}
      className={cn(className, TRANSCRIPT_FILE_CHIP_CLASS_NAME)}
      data-thread-markdown-ticket-chip=""
      aria-label={columnName === undefined ? `Ouvrir ${title}` : `Ouvrir ${title} · ${columnName}`}
      onClick={(event) => {
        if (onOpenTicket === undefined) {
          return
        }
        event.preventDefault()
        onOpenTicket(ticketId)
      }}
    >
      <TicketIcon aria-hidden className={FILE_CHIP_ICON_CLASS_NAME} />
      <span className="truncate leading-tight">{title}</span>
    </a>
  )
}
