// @vitest-environment happy-dom

import type { FilePreview } from "@noyau/protocol/file-preview"
import { ProjectId } from "@noyau/protocol/ids"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadMarkdown } from "../src/components/thread/ThreadMarkdown"
import { ToastProvider } from "../src/components/ui/toast"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { clearFilePreviewCache } from "../src/lib/file-preview"
import { resetMarkdownExternalLinkFavicons } from "../src/lib/markdown-external-links"

const previewFile = vi.hoisted(() =>
  vi.fn(
    (): Promise<{
      readonly ok: true
      readonly value: FilePreview
    }> =>
      Promise.resolve({
        ok: true,
        value: {
          kind: "text",
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
  resetMarkdownExternalLinkFavicons()
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

  it("inlines a composer ticket mention as a Ticket chip", () => {
    const ticketId = "40818da4-a4de-46f6-a60f-1aa305093a6e"
    render(
      <TooltipProvider>
        <ToastProvider>
          <ThreadMarkdown
            text={`travaille sur @ticket:${ticketId}`}
            workspaceRoot={workspaceRoot}
            projectId={projectId}
            tickets={[
              {
                ticketId,
                title: "Mentioner ticket dans transcript",
                columnName: "En cours",
                done: false,
              },
            ]}
          />
        </ToastProvider>
      </TooltipProvider>,
    )

    const chip = document.querySelector("[data-thread-markdown-ticket-chip]")
    expect(chip?.textContent).toContain("Mentioner ticket dans transcript")
    expect(chip?.getAttribute("href")).toBe(`/projects/${projectId}/board?ticket=${ticketId}`)
    expect(screen.queryByText(/@ticket:/)).toBeNull()
  })

  it("inlines a composer @path mention as a Pierre chip", () => {
    renderMarkdown("Que peux tu me dire que le fichier @astro.config.mjs")

    const chip = document.querySelector("[data-thread-markdown-file-chip]")
    expect(chip?.textContent).toContain("astro.config.mjs")
    expect(chip?.querySelector("[data-pierre-icon]")).not.toBeNull()
    expect(chip?.className).toMatch(/inline-flex/)
    expect(chip?.className).toMatch(/no-underline/)
    expect(chip?.className).toMatch(/align-middle/)
    expect(screen.queryByText(/@astro\.config\.mjs/)).toBeNull()
  })

  it("inlines an @path mention wrapped in markdown emphasis", () => {
    renderMarkdown("Le fichier **@astro.config.mjs** est à la racine.")

    const chip = document.querySelector("[data-thread-markdown-file-chip]")
    expect(chip?.textContent).toContain("astro.config.mjs")
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

  it("dresses an external markdown link with the site favicon", () => {
    renderMarkdown("Voir [docs](https://example.com/docs)")

    expect(document.querySelector("[data-thread-markdown-file-chip]")).toBeNull()
    const link = screen.getByRole("link", { name: "docs" })
    expect(link.getAttribute("href")).toBe("https://example.com/docs")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(link.hasAttribute("data-thread-markdown-external-link")).toBe(true)
    expect(link.querySelector("[data-thread-markdown-link-favicon]")?.getAttribute("src")).toBe(
      "https://www.google.com/s2/favicons?domain=example.com&sz=32",
    )
  })

  it("dresses a bare URL with the site favicon", () => {
    renderMarkdown("PR ouverte : https://github.com/Hezaerd/noyau/pull/200")

    const link = screen.getByRole("link", {
      name: "https://github.com/Hezaerd/noyau/pull/200",
    })
    expect(link.getAttribute("href")).toBe("https://github.com/Hezaerd/noyau/pull/200")
    expect(link.querySelector("[data-thread-markdown-link-favicon]")?.getAttribute("src")).toBe(
      "https://www.google.com/s2/favicons?domain=github.com&sz=32",
    )
  })

  it("falls back to a globe when the favicon fails to load", () => {
    renderMarkdown("Voir [docs](https://example.com/docs)")

    const favicon = document.querySelector("[data-thread-markdown-link-favicon]")
    expect(favicon).toBeInstanceOf(HTMLImageElement)
    if (favicon instanceof HTMLImageElement) {
      fireEvent.error(favicon)
    }
    expect(document.querySelector("[data-thread-markdown-link-globe]")).not.toBeNull()
    expect(document.querySelector("[data-thread-markdown-link-favicon]")).toBeNull()
  })

  it("leaves a same-document fragment without a favicon or new tab", () => {
    renderMarkdown("Voir [ici](#heading)")

    const link = screen.getByRole("link", { name: "ici" })
    expect(link.getAttribute("href")).toBe("#heading")
    expect(link.getAttribute("target")).toBeNull()
    expect(link.querySelector("[data-thread-markdown-link-favicon]")).toBeNull()
    expect(link.hasAttribute("data-thread-markdown-external-link")).toBe(false)
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

        fireEvent.click(screen.getByRole("link", { name: /Ouvrir .*greet\.py/ }))
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

        fireEvent.click(screen.getByRole("link", { name: /Ouvrir .*greet\.py/ }))
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
          user.hover(screen.getByRole("link", { name: /Ouvrir .*greet\.py/ })),
        )
        yield* Effect.promise(() =>
          waitFor(() => {
            const preview = document.querySelector(".thread-file-preview")
            expect(preview?.getAttribute("data-file-preview-kind")).toBe("code")
            expect(preview?.textContent).toContain("print('salut')")
            const tokens = preview?.querySelectorAll(
              "[data-streamdown='code-block-body'] span[style*='--sdm-c']",
            )
            expect(tokens?.length ?? 0).toBeGreaterThan(0)
          }),
        )
        expect(previewFile).toHaveBeenCalledWith({
          projectId,
          path: "/Users/hezaerd/project/src/greet.py",
        })
      }),
    ))

  it("left-aligns an image file-chip hover preview", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        previewFile.mockResolvedValueOnce({
          ok: true,
          value: {
            kind: "image" as const,
            mime: "image/png" as const,
            bytes: new Uint8Array([137, 80, 78, 71]),
            mtimeMs: 1,
          },
        })
        renderMarkdown("Regarde [shot.png](docs/shot.png)")
        const user = userEvent.setup()
        yield* Effect.promise(() =>
          user.hover(screen.getByRole("link", { name: /Ouvrir .*shot\.png/ })),
        )
        yield* Effect.promise(() =>
          waitFor(() => {
            const preview = document.querySelector('[data-slot="preview-card-content"] img')
            expect(preview?.className).toMatch(/object-left/)
            expect(preview?.className).not.toMatch(/mx-auto/)
            expect(preview?.getAttribute("src")?.startsWith("blob:")).toBe(true)
          }),
        )
      }),
    ))

  it("renders a markdown file preview as markdown", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        previewFile.mockResolvedValueOnce({
          ok: true,
          value: {
            kind: "text",
            text: "# Guide\n\nLis `src/greet.py` ensuite.",
            truncated: false,
            mtimeMs: 1,
          },
        })
        renderMarkdown("Regarde [guide](docs/guide.md)")
        const user = userEvent.setup()
        yield* Effect.promise(() =>
          user.hover(screen.getByRole("link", { name: /Ouvrir .*guide\.md/ })),
        )
        yield* Effect.promise(() =>
          waitFor(() => {
            const preview = document.querySelector(".thread-file-preview")
            expect(preview?.getAttribute("data-file-preview-kind")).toBe("markdown")
            expect(preview?.querySelector("h1")?.textContent).toBe("Guide")
            expect(preview?.querySelector("[data-thread-markdown-file-chip]")).toBeNull()
          }),
        )
      }),
    ))

  it("renders a markdown image link as a left-aligned thumbnail", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        previewFile.mockResolvedValueOnce({
          ok: true,
          value: {
            kind: "image" as const,
            mime: "image/png" as const,
            bytes: new Uint8Array([137, 80, 78, 71]),
            mtimeMs: 1,
          },
        })
        renderMarkdown("Voici ![capture](docs/shot.png)")

        expect(document.querySelector(".thread-markdown")).not.toBeNull()
        const expand = yield* Effect.promise(() =>
          screen.findByRole("button", { name: "Agrandir capture" }),
        )
        expect(expand.closest("span")?.className).toMatch(/inline-flex/)
        expect(expand.closest("[data-image-thumbnail]")).not.toBeNull()
        expect(expand.closest("[data-image-thumbnail]")?.className).toMatch(/size-14/)
        expect(document.querySelector('img[src^="https://file.invalid"]')).toBeNull()
        yield* Effect.promise(() =>
          waitFor(() => {
            expect(previewFile).toHaveBeenCalledWith({
              projectId,
              path: "/Users/hezaerd/project/docs/shot.png",
            })
            const image = expand.querySelector("img")
            expect(image?.getAttribute("src")?.startsWith("blob:")).toBe(true)
          }),
        )
        fireEvent.click(expand)
        expect(screen.getByRole("dialog", { name: "Aperçu agrandi" })).toBeTruthy()
        expect(screen.getByRole("img", { name: "capture" })).toBeTruthy()
        fireEvent.keyDown(window, { key: "Escape" })
        expect(screen.queryByRole("dialog", { name: "Aperçu agrandi" })).toBeNull()
      }),
    ))

  it("expands a remote markdown image", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        renderMarkdown("Voici ![logo](https://example.com/logo.png)")
        const expand = yield* Effect.promise(() =>
          screen.findByRole("button", { name: "Agrandir logo" }),
        )
        fireEvent.click(expand)
        expect(screen.getByRole("dialog", { name: "Aperçu agrandi" })).toBeTruthy()
        expect(screen.getByRole("img", { name: "logo" })).toBeTruthy()
        fireEvent.click(screen.getAllByRole("button", { name: "Fermer l’aperçu" })[0])
        expect(screen.queryByRole("dialog", { name: "Aperçu agrandi" })).toBeNull()
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
          user.hover(screen.getByRole("link", { name: /Ouvrir .*greet\.py/ })),
        )
        expect(yield* Effect.promise(() => screen.findByText("Aperçu indisponible"))).toBeTruthy()
        expect(previewFile).not.toHaveBeenCalled()
      }),
    ))
})
