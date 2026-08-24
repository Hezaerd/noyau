import { GitMergeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

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
      onClick={onClick}
      className="rounded-full border-amber-500/30 bg-background text-amber-500 shadow-xs hover:bg-amber-500/10 hover:text-amber-500"
    >
      <GitMergeIcon />
      Fix merge conflicts
    </Button>
  )
}
