/** Session partition for the desktop in-app guest. In-memory, shared across tabs. */
export const PREVIEW_GUEST_PARTITION = "noyau-preview"

/** Chromium abort; not a failed page load. */
export const PREVIEW_GUEST_ABORTED_ERROR_CODE = -3

const HTTP_SCHEMES = new Set(["http:", "https:"])
const HAS_AUTHORITY = /^[a-z][a-z0-9+.-]*:\/\//i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const HOST_AND_PORT = /^[a-z0-9][a-z0-9.-]*:\d/i

/** Refuse everything that is not a page the in-app guest should load. */
export const normalizePreviewUrl = (raw: string): string | null => {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }
  const candidate =
    /^https?:\/\//i.test(trimmed) ||
    (HAS_SCHEME.test(trimmed) && HAS_AUTHORITY.test(trimmed)) ||
    (HAS_SCHEME.test(trimmed) && !HOST_AND_PORT.test(trimmed))
      ? trimmed
      : `http://${trimmed}`
  try {
    const url = new URL(candidate)
    if (!HTTP_SCHEMES.has(url.protocol)) {
      return null
    }
    return url.href
  } catch {
    return null
  }
}

export const previewPageTitle = (url: string): string | null => {
  try {
    const hostname = new URL(url).hostname
    return hostname.length > 0 ? hostname : null
  } catch {
    return null
  }
}
