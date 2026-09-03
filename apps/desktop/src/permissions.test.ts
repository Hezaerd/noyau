import { describe, expect, it } from "vitest"

import { RENDERER_CLIPBOARD_WRITE_PERMISSION, isRendererPermissionAllowed } from "./permissions"

describe("renderer permissions", () => {
  it("grants clipboard-sanitized-write for navigator.clipboard.writeText", () => {
    expect(isRendererPermissionAllowed(RENDERER_CLIPBOARD_WRITE_PERMISSION)).toBe(true)
  })

  it.each(["clipboard-write", "clipboard-read", "midi", "notifications", "media"] as const)(
    "denies %s",
    (permission) => {
      expect(isRendererPermissionAllowed(permission)).toBe(false)
    },
  )
})
