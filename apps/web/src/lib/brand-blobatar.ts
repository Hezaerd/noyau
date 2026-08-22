import { releaseBrand } from "@noyau/shared/release-brand"

import type { DesktopReleaseChannel } from "@/lib/desktop-bridge"

export const BRAND_BLOBATAR_NAME = "noyau"

/** Fixed per channel. Does not follow the UI theme. Desktop icons reuse head/eye. */
export const brandBlobatarPalette = (channel: DesktopReleaseChannel = "latest") => {
  const { head, eye } = releaseBrand(channel).palette
  return { head, eye }
}
