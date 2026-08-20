import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"

import { Badge } from "@/components/ui/badge"
import { isCursorReady } from "@/lib/cursor-readiness"

export function CursorReadinessChip({
  status,
}: {
  readonly status: CursorProviderStatus | undefined
}) {
  if (status === undefined) {
    return <Badge variant="secondary">Vérification de Cursor…</Badge>
  }

  return (
    <Badge variant={isCursorReady(status) ? "success" : "warning"}>
      {isCursorReady(status) ? "Cursor prêt" : "Cursor indisponible"}
    </Badge>
  )
}
