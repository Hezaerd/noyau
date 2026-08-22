import { PierreEntryIcon } from "@/components/PierreEntryIcon"
import {
  COMPOSER_FILE_CHIP_CLASS_NAME,
  FILE_CHIP_ICON_CLASS_NAME,
  FILE_CHIP_LABEL_CLASS_NAME,
} from "@/lib/file-chip"
import { basenameOfPath, inferEntryKindFromPath } from "@/lib/pierre-icons"
import { cn } from "@/lib/utils"

export function ComposerFileChip({
  path,
  kind,
  className,
}: {
  readonly path: string
  readonly kind?: "file" | "directory"
  readonly className?: string | undefined
}) {
  return (
    <span
      className={cn(COMPOSER_FILE_CHIP_CLASS_NAME, className)}
      data-composer-file-chip=""
      contentEditable={false}
    >
      <PierreEntryIcon
        pathValue={path}
        kind={kind ?? inferEntryKindFromPath(path)}
        className={FILE_CHIP_ICON_CLASS_NAME}
      />
      <span className={FILE_CHIP_LABEL_CLASS_NAME}>{basenameOfPath(path)}</span>
    </span>
  )
}
