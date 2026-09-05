import { afterEach, describe, expect, it, vi } from "vitest"

import { toastManager } from "../src/components/ui/toast"
import { copyPullRequestLink } from "../src/lib/pull-request-actions"

const writeClipboardText = vi.hoisted(() => vi.fn())

vi.mock("../src/lib/clipboard", () => ({
  writeClipboardText,
}))

const addToast = vi.spyOn(toastManager, "add")

afterEach(() => {
  writeClipboardText.mockReset()
  addToast.mockReset()
})

describe("copyPullRequestLink", () => {
  it("copies the URL and confirms it with a success toast", async () => {
    const url = "https://github.com/hezaerd/noyau/pull/5"
    writeClipboardText.mockResolvedValue(undefined)

    await copyPullRequestLink(url)

    expect(writeClipboardText).toHaveBeenCalledWith(url)
    expect(addToast).toHaveBeenCalledWith({
      description: url,
      id: "thread-pr-link-copied",
      title: "PR link copied",
      type: "success",
    })
  })

  it("reports clipboard failures", async () => {
    writeClipboardText.mockRejectedValue(new Error("Clipboard unavailable"))

    await copyPullRequestLink("https://github.com/hezaerd/noyau/pull/5")

    expect(addToast).toHaveBeenCalledWith({
      description: "The clipboard refused the pull request link.",
      title: "Unable to copy PR link",
      type: "error",
    })
  })
})
