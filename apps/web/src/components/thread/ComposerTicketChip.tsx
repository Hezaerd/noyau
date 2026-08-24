import { TicketIcon } from "lucide-react"

import {
  COMPOSER_FILE_CHIP_CLASS_NAME,
  FILE_CHIP_ICON_CLASS_NAME,
  FILE_CHIP_LABEL_CLASS_NAME,
} from "@/lib/file-chip"
import { cn } from "@/lib/utils"

export function ComposerTicketChip({
  title,
  className,
}: {
  readonly title: string
  readonly className?: string | undefined
}) {
  return (
    <span
      className={cn(COMPOSER_FILE_CHIP_CLASS_NAME, className)}
      data-composer-ticket-chip=""
      contentEditable={false}
    >
      <TicketIcon aria-hidden className={FILE_CHIP_ICON_CLASS_NAME} />
      <span className={FILE_CHIP_LABEL_CLASS_NAME}>{title}</span>
    </span>
  )
}
