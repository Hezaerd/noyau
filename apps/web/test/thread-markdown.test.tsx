// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadMarkdown } from "../src/components/thread/ThreadMarkdown"
import { ToastProvider } from "../src/components/ui/toast"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderMarkdown = (text: string) =>
  render(
    <ToastProvider>
      <ThreadMarkdown text={text} />
    </ToastProvider>,
  )

describe("ThreadMarkdown", () => {
  it("copies a code block and upserts a success toast", async () => {
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    renderMarkdown("```ts\nconst ready = true\n```")

    expect(screen.queryByTitle("Download file")).toBeNull()
    const copy = screen.getByRole("button", { name: "Copier le code" })
    fireEvent.click(copy)
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    const copied = writeText.mock.calls[0]?.[0]
    expect(copied).toContain("const ready = true")
    expect(await screen.findByText("Copié")).toBeTruthy()

    fireEvent.click(copy)
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(2)
    })
    expect(screen.getAllByText("Copié")).toHaveLength(1)
  })

  it("toasts an error when clipboard write is denied", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Write permission denied"),
    )
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => false,
    })
    renderMarkdown("```ts\nconst ready = true\n```")

    fireEvent.click(screen.getByRole("button", { name: "Copier le code" }))
    expect(await screen.findByText("Copie impossible")).toBeTruthy()
  })

  it("renders KaTeX for block math", () => {
    renderMarkdown("$$\nE = mc^2\n$$")
    expect(document.querySelector(".katex")).not.toBeNull()
  })
})
