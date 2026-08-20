import type { CursorProviderStatus } from "@noyau/protocol/entities/environment"

export const isCursorReady = (status: CursorProviderStatus | undefined): boolean =>
  status?.installed === true && status.handshakeOk
