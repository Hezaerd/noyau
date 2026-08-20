/**
 * `navigator.clipboard.writeText()` is gated by Electron's permission *check*
 * handler, not only the request handler. The Chromium name is
 * `clipboard-sanitized-write` — `clipboard-write` is not a valid permission
 * and must stay denied.
 */
export const RENDERER_CLIPBOARD_WRITE_PERMISSION = "clipboard-sanitized-write"

export const isRendererPermissionAllowed = (permission: string): boolean =>
  permission === RENDERER_CLIPBOARD_WRITE_PERMISSION
