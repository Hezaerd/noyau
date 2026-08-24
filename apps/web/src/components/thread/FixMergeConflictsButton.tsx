import { GitMergeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FIX_MERGE_CONFLICTS_PRESENTATION, turnPresentationLabel } from "@/lib/turn-presentation"

export function FixMergeConflictsButton({
  disabled,
  onClick,
}: {
  readonly disabled: boolean
  readonly onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={disabled}
      className="text-warning hover:text-warning"
      onClick={onClick}
    >
      <GitMergeIcon aria-hidden="true" />
      {turnPresentationLabel(FIX_MERGE_CONFLICTS_PRESENTATION)}
    </Button>
  )
}
