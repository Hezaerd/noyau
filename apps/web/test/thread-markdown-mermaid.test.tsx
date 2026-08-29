// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadMarkdownMermaid } from "../src/components/thread/ThreadMarkdownMermaid"
import { TooltipProvider } from "../src/components/ui/tooltip"
import type { MermaidRenderResult } from "../src/lib/thread-markdown-mermaid"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

const { okSvg, renderThreadMermaidChart } = vi.hoisted(() => {
  const ok: MermaidRenderResult = {
    _tag: "ok",
    svg: '<svg data-testid="mermaid-svg"></svg>',
  }
  return {
    okSvg: ok,
    renderThreadMermaidChart: vi.fn(async (): Promise<MermaidRenderResult> => ok),
  }
})

vi.mock("../src/lib/thread-markdown-mermaid", () => ({
  renderThreadMermaidChart,
}))

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
  renderThreadMermaidChart.mockClear()
  renderThreadMermaidChart.mockResolvedValue(okSvg)
})

const renderDiagram = (props: { readonly chart: string; readonly incomplete: boolean }) =>
  render(
    <AppAtomRegistryProvider>
      <TooltipProvider>
        <ThreadMarkdownMermaid {...props} />
      </TooltipProvider>
    </AppAtomRegistryProvider>,
  )

describe("ThreadMarkdownMermaid", () => {
  it("keeps a static placeholder while the fence is incomplete", () => {
    renderDiagram({ chart: "sequenceDiagram\n    UI->>WS: attach", incomplete: true })

    expect(screen.getByText("Diagram")).toBeTruthy()
    expect(screen.queryByTestId("mermaid-svg")).toBeNull()
    expect(renderThreadMermaidChart).not.toHaveBeenCalled()
  })

  it("renders the SVG once the fence is complete", async () => {
    renderDiagram({ chart: "sequenceDiagram\n    UI->>WS: attach", incomplete: false })

    await waitFor(() => {
      expect(screen.getByTestId("mermaid-svg")).toBeTruthy()
    })
    expect(screen.getByText("mermaid")).toBeTruthy()
    expect(screen.queryByText("Diagram")).toBeNull()
  })

  it("shows source after a failed render and retries", async () => {
    const user = userEvent.setup()
    renderThreadMermaidChart.mockResolvedValueOnce({
      _tag: "error",
      message: "Parse error on line 1",
    })
    renderDiagram({ chart: "not a diagram", incomplete: false })

    await waitFor(() => {
      expect(screen.getByText("Couldn't render this diagram.")).toBeTruthy()
    })
    expect(screen.getByText("Parse error on line 1")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Show source" }))
    expect(screen.getByText("not a diagram")).toBeTruthy()

    renderThreadMermaidChart.mockResolvedValueOnce(okSvg)
    await user.click(screen.getByRole("button", { name: "Try again" }))

    await waitFor(() => {
      expect(screen.getByTestId("mermaid-svg")).toBeTruthy()
    })
    expect(screen.queryByText("Couldn't render this diagram.")).toBeNull()
  })
})
