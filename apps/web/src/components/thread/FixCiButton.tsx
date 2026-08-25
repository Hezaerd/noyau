import { CircleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FIX_CI_PRESENTATION, turnPresentationLabel } from "@/lib/turn-presentation"

export function FixCiButton({
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
      className="text-destructive hover:text-destructive"
      onClick={onClick}
    >
      <CircleAlertIcon aria-hidden="true" />
      {turnPresentationLabel(FIX_CI_PRESENTATION)}
    </Button>
  )
}
