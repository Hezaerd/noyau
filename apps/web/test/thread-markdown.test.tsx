// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadMarkdown } from "../src/components/thread/ThreadMarkdown"
import { ToastProvider } from "../src/components/ui/toast"
import { TooltipProvider } from "../src/components/ui/tooltip"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const renderMarkdown = (text: string) =>
  render(
    <TooltipProvider>
      <ToastProvider>
        <ThreadMarkdown text={text} />
      </ToastProvider>
    </TooltipProvider>,
  )

describe("ThreadMarkdown", () => {
  it("copies a code block and upserts a success toast", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
        renderMarkdown("```ts\nconst ready = true\n```")

        expect(screen.queryByTitle("Download file")).toBeNull()
        const copy = screen.getByRole("button", { name: "Copier le code" })
        fireEvent.click(copy)
        yield* Effect.promise(() =>
          waitFor(() => {
            expect(writeText).toHaveBeenCalled()
          }),
        )
        const copied = writeText.mock.calls[0]?.[0]
        expect(copied).toContain("const ready = true")
        expect(yield* Effect.promise(() => screen.findByText("Copié"))).toBeTruthy()

        fireEvent.click(copy)
        yield* Effect.promise(() =>
          waitFor(() => {
            expect(writeText).toHaveBeenCalledTimes(2)
          }),
        )
        expect(screen.getAllByText("Copié")).toHaveLength(1)
      }),
    ))

  it("toasts an error when clipboard write is denied", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
          new Error("Write permission denied"),
        )
        Object.defineProperty(document, "execCommand", {
          configurable: true,
          value: () => false,
        })
        renderMarkdown("```ts\nconst ready = true\n```")

        fireEvent.click(screen.getByRole("button", { name: "Copier le code" }))
        expect(yield* Effect.promise(() => screen.findByText("Copie impossible"))).toBeTruthy()
      }),
    ))

  it("renders KaTeX for block math", () => {
    renderMarkdown("$$\nE = mc^2\n$$")
    expect(document.querySelector(".katex")).not.toBeNull()
  })

  it("renders tables inline without artifact controls", () => {
    renderMarkdown("| Tentation | Pourquoi non |\n| --- | --- |\n| Formulaire | Hors scope |")

    const table = screen.getByRole("table")
    const wrapper = table.closest(".thread-markdown-table")

    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelector("button")).toBeNull()
    expect(document.querySelector('[data-streamdown="table-wrapper"]')).toBeNull()
  })

  it("renders a language title and toggles wrap on the code block", () => {
    renderMarkdown("```python\nprint('salut')\n```")

    const block = document.querySelector(".thread-markdown-codeblock")
    expect(block?.getAttribute("data-language")).toBe("python")
    expect(block?.querySelector(".thread-markdown-codeblock-header")?.textContent).toContain(
      "python",
    )
    const wrap = screen.getByRole("button", { name: "Ajuster les lignes" })
    expect(block?.getAttribute("data-wrap")).toBe("false")

    fireEvent.click(wrap)
    expect(block?.getAttribute("data-wrap")).toBe("true")
    expect(screen.getByRole("button", { name: "Désactiver le retour à la ligne" })).toBeTruthy()
  })

  it("applies Shiki token colors on a TypeScript fence", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        renderMarkdown("```ts\nconst ready = true\n```")

        yield* Effect.promise(() =>
          waitFor(() => {
            const tokens = document.querySelectorAll(
              "[data-streamdown='code-block-body'] span[style*='--sdm-c']",
            )
            expect(tokens.length).toBeGreaterThan(1)
          }),
        )

        const colors = new Set(
          [
            ...document.querySelectorAll(
              "[data-streamdown='code-block-body'] span[style*='--sdm-c']",
            ),
          ]
            .map((node) =>
              node instanceof HTMLElement ? node.style.getPropertyValue("--sdm-c") : "",
            )
            .filter((color) => color.length > 0),
        )
        expect(colors.size).toBeGreaterThan(1)
      }),
    ))
})
