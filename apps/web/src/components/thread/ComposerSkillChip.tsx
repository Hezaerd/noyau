import { SparklesIcon } from "lucide-react"

import {
  COMPOSER_FILE_CHIP_CLASS_NAME,
  FILE_CHIP_ICON_CLASS_NAME,
  FILE_CHIP_LABEL_CLASS_NAME,
} from "@/lib/file-chip"
import { cn } from "@/lib/utils"

export function ComposerSkillChip({
  displayName,
  className,
}: {
  readonly displayName: string
  readonly className?: string | undefined
}) {
  return (
    <span
      className={cn(COMPOSER_FILE_CHIP_CLASS_NAME, className)}
      data-composer-skill-chip=""
      contentEditable={false}
    >
      <SparklesIcon aria-hidden className={FILE_CHIP_ICON_CLASS_NAME} />
      <span className={FILE_CHIP_LABEL_CLASS_NAME}>{displayName}</span>
    </span>
  )
}
