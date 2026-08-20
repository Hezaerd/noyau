import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"

import { Badge } from "@/components/ui/badge"

export const isCursorReady = (status: CursorProviderStatus | undefined): boolean =>
  status?.installed === true && status.handshakeOk === true

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
