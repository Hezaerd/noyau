import { ThreadId } from "@noyau/protocol/ids"
import { MessageCircleIcon } from "lucide-react"

import {
  FILE_CHIP_CLASS_NAME,
  FILE_CHIP_ICON_CLASS_NAME,
  FILE_CHIP_LABEL_CLASS_NAME,
  TRANSCRIPT_FILE_CHIP_CLASS_NAME,
} from "@/lib/file-chip"
import { isTicketActivityThreadJumpable, type TicketActivityThreadRef } from "@/lib/ticket-activity"
import { cn } from "@/lib/utils"

const CHIP_CLASS_NAME = `${FILE_CHIP_CLASS_NAME} max-w-40 align-middle text-[11px]`

const availabilityHint = (availability: TicketActivityThreadRef["availability"]): string => {
  switch (availability) {
    case "archived":
      return "Thread archivé — ouverture impossible"
    case "missing":
      return "Thread supprimé — ouverture impossible"
    case "active":
      return ""
  }
}

export function TicketActivityThreadChip({
  thread,
  onOpenThread,
}: {
  readonly thread: TicketActivityThreadRef
  readonly onOpenThread?: ((threadId: ThreadId) => void) | undefined
}) {
  const jumpable = isTicketActivityThreadJumpable(thread) && onOpenThread !== undefined
  const hint = availabilityHint(thread.availability)

  if (jumpable) {
    return (
      <button
        type="button"
        className={cn(TRANSCRIPT_FILE_CHIP_CLASS_NAME, "max-w-40 align-middle text-[11px]")}
        data-ticket-activity-thread-chip=""
        aria-label={`Ouvrir le Thread ${thread.title}`}
        onClick={() => onOpenThread(ThreadId.make(thread.threadId))}
      >
        <MessageCircleIcon aria-hidden className={FILE_CHIP_ICON_CLASS_NAME} />
        <span className={FILE_CHIP_LABEL_CLASS_NAME}>{thread.title}</span>
      </button>
    )
  }

  return (
    <span
      className={cn(CHIP_CLASS_NAME, "cursor-default text-muted-foreground")}
      data-ticket-activity-thread-chip=""
      title={hint === "" ? undefined : hint}
    >
      <MessageCircleIcon aria-hidden className={FILE_CHIP_ICON_CLASS_NAME} />
      <span className={FILE_CHIP_LABEL_CLASS_NAME}>{thread.title}</span>
    </span>
  )
}
