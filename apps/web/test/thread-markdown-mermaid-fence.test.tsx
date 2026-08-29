// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadMarkdown } from "../src/components/thread/ThreadMarkdown"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

vi.mock("../src/components/thread/ThreadMarkdownMermaid", () => ({
  ThreadMarkdownMermaid: ({
    chart,
    incomplete,
  }: {
    readonly chart: string
    readonly incomplete: boolean
  }) => (
    <div data-incomplete={String(incomplete)} data-testid="thread-mermaid">
      {chart}
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

describe("ThreadMarkdown mermaid fences", () => {
  it("routes a mermaid fence to the diagram renderer instead of a code block", () => {
    render(
      <AppAtomRegistryProvider>
        <ThreadMarkdown text={"```mermaid\nsequenceDiagram\n    UI->>WS: attach\n```"} />
      </AppAtomRegistryProvider>,
    )

    expect(screen.getByTestId("thread-mermaid").textContent).toContain("sequenceDiagram")
    expect(screen.queryByText("Wrap lines")).toBeNull()
  })
})
