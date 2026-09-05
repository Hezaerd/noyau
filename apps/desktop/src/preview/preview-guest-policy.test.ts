import { Option } from "effect"
import { describe, expect, it, vi } from "vitest"

import {
  decodePreviewAttachParams,
  handlePreviewGuestAttach,
  handlePreviewGuestNavigate,
  handlePreviewGuestWindowOpen,
  isPreviewGuestLoadFailure,
  isPreviewGuestUrl,
} from "./preview-guest-policy.ts"

describe("preview guest policy", () => {
  it("allows only http(s) pages", () => {
    expect(isPreviewGuestUrl("https://noyau.example/path")).toBe(true)
    expect(isPreviewGuestUrl("http://localhost:5173/")).toBe(true)
    expect(isPreviewGuestUrl("javascript:alert(1)")).toBe(false)
    expect(isPreviewGuestUrl("file:///etc/passwd")).toBe(false)
    expect(isPreviewGuestUrl("")).toBe(false)
  })

  it("prevents navigation to a blocked scheme", () => {
    const prevent = vi.fn()
    handlePreviewGuestNavigate("https://noyau.example/", prevent)
    expect(prevent).not.toHaveBeenCalled()
    handlePreviewGuestNavigate("file:///tmp", prevent)
    expect(prevent).toHaveBeenCalledTimes(1)
  })

  it("opens http(s) popups outside the guest and denies the window", () => {
    const openExternal = vi.fn()
    expect(handlePreviewGuestWindowOpen("https://noyau.example/docs", openExternal)).toEqual({
      action: "deny",
    })
    expect(openExternal).toHaveBeenCalledWith("https://noyau.example/docs")
    openExternal.mockClear()
    expect(handlePreviewGuestWindowOpen("javascript:alert(1)", openExternal)).toEqual({
      action: "deny",
    })
    expect(openExternal).not.toHaveBeenCalled()
  })

  it("attaches only the preview partition with an http(s) src and strips preload", () => {
    const prevent = vi.fn()
    const allowed = { preload: "guest.js", preloadURL: "file:///guest.js" }
    handlePreviewGuestAttach(
      { src: "https://noyau.example/", partition: "noyau-preview" },
      allowed,
      prevent,
    )
    expect(prevent).not.toHaveBeenCalled()
    expect(allowed.preload).toBeUndefined()
    expect(allowed.preloadURL).toBeUndefined()

    handlePreviewGuestAttach(
      { src: "https://noyau.example/", partition: "persist:other" },
      {},
      prevent,
    )
    expect(prevent).toHaveBeenCalledTimes(1)
    handlePreviewGuestAttach({ src: "file:///tmp", partition: "noyau-preview" }, {}, prevent)
    expect(prevent).toHaveBeenCalledTimes(2)
    expect(Option.isNone(decodePreviewAttachParams({ src: 1, partition: "noyau-preview" }))).toBe(
      true,
    )
  })

  it("ignores aborted subframe failures", () => {
    expect(isPreviewGuestLoadFailure({ errorCode: -3, isMainFrame: true })).toBe(false)
    expect(isPreviewGuestLoadFailure({ errorCode: -105, isMainFrame: false })).toBe(false)
    expect(isPreviewGuestLoadFailure({ errorCode: -105, isMainFrame: true })).toBe(true)
  })
})
