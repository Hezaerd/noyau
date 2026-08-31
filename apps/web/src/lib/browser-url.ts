import { normalizePreviewUrl, previewPageTitle } from "@noyau/shared/preview-url"
import { Option, Schema } from "effect"

export const normalizeBrowserUrl = normalizePreviewUrl

const decodeCommittedUrl = Schema.decodeUnknownOption(Schema.NullishOr(Schema.String))

/** URL committed on a browser tab payload, or null when the tab is still empty. */
export const browserTabUrl = (payload: { readonly url?: unknown }): string | null =>
  Option.match(decodeCommittedUrl(payload.url), {
    onNone: () => null,
    onSome: (url) => (url == null ? null : normalizeBrowserUrl(url)),
  })

export const browserTabTitle = (url: string | null): string => {
  if (url === null || url.length === 0) {
    return "Browser"
  }
  return previewPageTitle(url) ?? "Browser"
}
