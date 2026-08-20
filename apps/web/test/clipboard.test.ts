// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { writeClipboardText } from "../src/lib/clipboard"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("writeClipboardText", () => {
  it("writes through navigator.clipboard.writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })

    await writeClipboardText("const ready = true")

    expect(writeText).toHaveBeenCalledWith("const ready = true")
  })

  it("falls back to execCommand when writeText is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Write permission denied"))
    const execCommand = vi.fn().mockReturnValue(true)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    })

    await writeClipboardText("fallback payload")

    expect(writeText).toHaveBeenCalledWith("fallback payload")
    expect(execCommand).toHaveBeenCalledWith("copy")
  })

  it("rejects when both clipboard APIs fail", async () => {
    vi.stubGlobal("navigator", { clipboard: {} })
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    })

    await expect(writeClipboardText("blocked")).rejects.toThrow("Clipboard write failed")
  })
})
