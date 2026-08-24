import { TurnPresentationBubble } from "@/components/thread/TurnPresentationBubble"
import { FIX_MERGE_CONFLICTS_PRESENTATION } from "@/lib/turn-presentation"

export function FixMergeConflictsButton({
  disabled,
  onClick,
}: {
  readonly disabled: boolean
  readonly onClick: () => void
}) {
  return (
    <TurnPresentationBubble
      presentation={FIX_MERGE_CONFLICTS_PRESENTATION}
      action={{ disabled, onClick }}
    />
  )
}
