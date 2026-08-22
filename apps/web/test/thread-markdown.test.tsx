// @vitest-environment happy-dom

import { ProjectId } from "@noyau/protocol/ids"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadMarkdown } from "../src/components/thread/ThreadMarkdown"
import { ToastProvider } from "../src/components/ui/toast"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { clearFilePreviewCache } from "../src/lib/file-preview"

const previewFile = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      value: {
        kind: "text" as const,
        text: "print('salut')",
        truncated: false,
        mtimeMs: 1,
      },
    }),
  ),
)

vi.mock("@/lib/control-plane", () => ({
  previewFile,
}))

Object.defineProperty(HTMLElement.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  previewFile.mockClear()
  clearFilePreviewCache()
  Object.defineProperty(window, "noyauDesktop", {
    configurable: true,
    value: undefined,
  })
})

const workspaceRoot = "/Users/hezaerd/project"
const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")

const renderMarkdown = (text: string, cwd = workspaceRoot, previewProjectId = projectId) =>
  render(
    <TooltipProvider>
      <ToastProvider>
        <ThreadMarkdown text={text} workspaceRoot={cwd} projectId={previewProjectId} />
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

  it("renders a language icon and toggles wrap on the code block", () => {
    renderMarkdown("```python\nprint('salut')\n```")

    const block = document.querySelector(".thread-markdown-codeblock")
    expect(block?.getAttribute("data-language")).toBe("python")
    expect(block?.querySelector('[aria-label="Langage : python"]')).not.toBeNull()
    expect(block?.querySelector("[data-pierre-icon]")).not.toBeNull()
    const wrap = screen.getByRole("button", { name: "Ajuster les lignes" })
    expect(block?.getAttribute("data-wrap")).toBe("false")

    fireEvent.click(wrap)
    expect(block?.getAttribute("data-wrap")).toBe("true")
    expect(screen.getByRole("button", { name: "Désactiver le retour à la ligne" })).toBeTruthy()
  })

  it("renders a citation path with its file icon", () => {
    renderMarkdown("```16:40:src/greet.py\nprint('salut')\n```")

    const block = document.querySelector(".thread-markdown-codeblock")
    expect(block?.getAttribute("data-language")).toBe("py")
    expect(block?.querySelector(".thread-markdown-codeblock-header")?.textContent).toContain(
      "src/greet.py",
    )
    expect(block?.querySelector("[data-pierre-icon]")).not.toBeNull()
  })

  it("falls back to the language text when Pierre has no specific icon", () => {
    renderMarkdown("```unknownlang\nnoop\n```")

    const block = document.querySelector(".thread-markdown-codeblock")
    expect(block?.getAttribute("data-language")).toBe("unknownlang")
    expect(block?.querySelector(".thread-markdown-codeblock-header")?.textContent).toContain(
      "unknownlang",
    )
    expect(block?.querySelector("[data-pierre-icon]")).toBeNull()
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

        const tokens = [
          ...document.querySelectorAll(
            "[data-streamdown='code-block-body'] span[style*='--sdm-c']",
          ),
        ].filter((node): node is HTMLElement => node instanceof HTMLElement)
        const lightColors = new Set(
          tokens
            .map((node) => node.style.getPropertyValue("--sdm-c"))
            .filter((color) => color.length > 0),
        )
        expect(lightColors.size).toBeGreaterThan(1)
        expect(
          tokens.some((node) => {
            const light = node.style.getPropertyValue("--sdm-c")
            const dark = node.style.getPropertyValue("--shiki-dark")
            return light.length > 0 && dark.length > 0 && light !== dark
          }),
        ).toBe(true)
      }),
    ))

  it("inlines a markdown file mention as a Pierre chip", () => {
    renderMarkdown("Regarde [greet.py](src/greet.py) s'il te plait")

    const chip = document.querySelector("[data-thread-markdown-file-chip]")
    expect(chip?.textContent).toContain("greet.py")
    expect(chip?.querySelector("[data-pierre-icon]")).not.toBeNull()
    expect(screen.queryByRole("link", { name: "greet.py" })).toBeNull()
  })

  it("inlines a path-shaped code span as a Pierre chip", () => {
    renderMarkdown("Lis `src/processRunner.ts:71` ensuite")

    const chip = document.querySelector("[data-thread-markdown-file-chip]")
    expect(chip?.textContent).toContain("processRunner.ts")
    expect(chip?.textContent).toContain("L71")
    expect(chip?.querySelector("[data-pierre-icon]")).not.toBeNull()
    expect(document.querySelector("[data-streamdown='inline-code']")).toBeNull()
  })

  it("keeps a bare filename inline code span as code", () => {
    renderMarkdown("Ouvre `AGENTS.md`")

    expect(document.querySelector("[data-thread-markdown-file-chip]")).toBeNull()
    expect(document.querySelector("[data-streamdown='inline-code']")?.textContent).toBe("AGENTS.md")
  })

  it("keeps an external markdown link as a normal anchor", () => {
    renderMarkdown("Voir [docs](https://example.com/docs)")

    expect(document.querySelector("[data-thread-markdown-file-chip]")).toBeNull()
    expect(screen.getByRole("link", { name: "docs" }).getAttribute("href")).toBe(
      "https://example.com/docs",
    )
  })

  it("opens the resolved file path when the chip is clicked", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const openPath = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(window, "noyauDesktop", {
          configurable: true,
          value: { openPath },
        })
        renderMarkdown("Regarde [greet.py](src/greet.py)")

        fireEvent.click(screen.getByRole("button", { name: /Ouvrir .*greet\.py/ }))
        yield* Effect.promise(() =>
          waitFor(() => {
            expect(openPath).toHaveBeenCalledWith("/Users/hezaerd/project/src/greet.py")
          }),
        )
      }),
    ))

  it("toasts when the Desktop bridge cannot open the file", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        renderMarkdown("Regarde [greet.py](src/greet.py)")

        fireEvent.click(screen.getByRole("button", { name: /Ouvrir .*greet\.py/ }))
        expect(yield* Effect.promise(() => screen.findByText("Ouverture impossible"))).toBeTruthy()
      }),
    ))

  it("disambiguates colliding file basenames with a parent suffix", () => {
    renderMarkdown("Compare [foo.ts](src/foo.ts) et [foo.ts](lib/foo.ts)")

    const chips = [...document.querySelectorAll("[data-thread-markdown-file-chip]")]
    expect(chips.map((chip) => chip.textContent)).toEqual(["foo.ts · src", "foo.ts · lib"])
  })

  it("loads a text preview when the file chip is hovered", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        renderMarkdown("Regarde [greet.py](src/greet.py)")
        const user = userEvent.setup()
        yield* Effect.promise(() =>
          user.hover(screen.getByRole("button", { name: /Ouvrir .*greet\.py/ })),
        )
        expect(yield* Effect.promise(() => screen.findByText("print('salut')"))).toBeTruthy()
        expect(previewFile).toHaveBeenCalledWith({
          projectId,
          path: "/Users/hezaerd/project/src/greet.py",
        })
      }),
    ))

  it("shows an unavailable preview without fetching when the Project is unknown", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        render(
          <TooltipProvider>
            <ToastProvider>
              <ThreadMarkdown
                text="Regarde [greet.py](src/greet.py)"
                workspaceRoot={workspaceRoot}
              />
            </ToastProvider>
          </TooltipProvider>,
        )
        const user = userEvent.setup()
        yield* Effect.promise(() =>
          user.hover(screen.getByRole("button", { name: /Ouvrir .*greet\.py/ })),
        )
        expect(yield* Effect.promise(() => screen.findByText("Aperçu indisponible"))).toBeTruthy()
        expect(previewFile).not.toHaveBeenCalled()
      }),
    ))
})
