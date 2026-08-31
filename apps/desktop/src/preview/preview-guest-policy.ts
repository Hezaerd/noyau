import { PREVIEW_GUEST_ABORTED_ERROR_CODE, normalizePreviewUrl } from "@noyau/shared/preview-url"

export { PREVIEW_GUEST_PARTITION } from "@noyau/shared/preview-url"

export const isPreviewGuestUrl = (raw: string): boolean => normalizePreviewUrl(raw) !== null

export const isPreviewGuestLoadFailure = (input: {
  readonly errorCode: number
  readonly isMainFrame: boolean
}): boolean => input.isMainFrame && input.errorCode !== PREVIEW_GUEST_ABORTED_ERROR_CODE

export const handlePreviewGuestNavigate = (url: string, prevent: () => void): void => {
  if (!isPreviewGuestUrl(url)) {
    prevent()
  }
}

export type PreviewWindowOpenResult = {
  readonly action: "deny"
}

export const handlePreviewGuestWindowOpen = (
  url: string,
  openExternal: (url: string) => void,
): PreviewWindowOpenResult => {
  if (isPreviewGuestUrl(url)) {
    openExternal(url)
  }
  return { action: "deny" }
}
