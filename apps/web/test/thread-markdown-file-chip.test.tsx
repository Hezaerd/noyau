// @vitest-environment happy-dom

import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Effect, Schema } from "effect"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ThreadMarkdownContext } from "../src/components/thread/thread-markdown-context"
import { ThreadMarkdownFileChip } from "../src/components/thread/ThreadMarkdownFileChip"
import { emptyThreadMarkdownFileLinks } from "../src/lib/markdown-file-links"

const { loadFilePreview, peekFilePreview } = vi.hoisted(() => ({
  loadFilePreview: vi.fn(),
  peekFilePreview: vi.fn(),
}))

vi.mock("../src/lib/file-preview", () => ({ loadFilePreview, peekFilePreview }))

vi.mock("../src/components/ui/preview-card", () => ({
  PreviewCard: ({
    children,
    onOpenChange,
  }: {
    readonly children: ReactNode
    readonly onOpenChange: (open: boolean) => void
  }) => (
    <div
      data-testid="preview-card"
      onMouseEnter={() => {
        onOpenChange(true)
      }}
    >
      {children}
    </div>
  ),
  PreviewCardTrigger: ({ children }: { readonly children: ReactNode }) => <a>{children}</a>,
  PreviewCardPopup: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
}))

const projectId = Schema.decodeSync(ProjectId)("10000000-0000-4000-8000-000000000001")
const firstThreadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000001")
const secondThreadId = Schema.decodeSync(ThreadId)("20000000-0000-4000-8000-000000000002")
const meta = {
  filePath: "/tmp/example.ts",
  targetPath: "/tmp/example.ts",
  displayPath: "/tmp/example.ts",
  workspaceRelativePath: "example.ts",
  basename: "example.ts",
  line: undefined,
  column: undefined,
}

const context = (threadId: ThreadId) => ({
  ...emptyThreadMarkdownFileLinks("/tmp"),
  projectId,
  threadId,
})
const firstContext = context(firstThreadId)
const secondContext = context(secondThreadId)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ThreadMarkdownFileChip", () => {
  it("does not render a preview loaded for the previous thread scope", async () => {
    loadFilePreview
      .mockResolvedValueOnce({ kind: "text", text: "first thread", truncated: false, mtimeMs: 1 })
      .mockReturnValueOnce(Effect.runPromise(Effect.never))
    peekFilePreview.mockReturnValue(undefined)

    const { rerender } = render(
      <ThreadMarkdownContext.Provider value={firstContext}>
        <ThreadMarkdownFileChip meta={meta} parentSuffix={undefined} />
      </ThreadMarkdownContext.Provider>,
    )
    fireEvent.mouseEnter(screen.getByTestId("preview-card"))
    expect(await screen.findByText("first thread")).toBeDefined()

    rerender(
      <ThreadMarkdownContext.Provider value={secondContext}>
        <ThreadMarkdownFileChip meta={meta} parentSuffix={undefined} />
      </ThreadMarkdownContext.Provider>,
    )

    expect(screen.queryByText("first thread")).toBeNull()
    expect(loadFilePreview).toHaveBeenLastCalledWith(projectId, secondThreadId, meta.filePath)
  })
})
