// @vitest-environment happy-dom

import { checkpointRefForTurn, TurnDiff } from "@noyau/contracts/entities/turn"
import { ThreadId } from "@noyau/contracts/ids"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ThreadTurnDiffCard } from "../src/components/thread/ThreadTurnDiffCard"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
})

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")

const decodeTurnDiff = (files: TurnDiff["files"]): TurnDiff =>
  Schema.decodeSync(TurnDiff)({
    checkpointRef: checkpointRefForTurn(threadId, 1),
    status: "ready",
    files,
  })

const renderCard = (ui: ReactNode) =>
  render(
    <AppAtomRegistryProvider>
      <TooltipProvider>{ui}</TooltipProvider>
    </AppAtomRegistryProvider>,
  )

describe("ThreadTurnDiffCard", () => {
  it("garde le header compact et le singulier", () => {
    renderCard(
      <ThreadTurnDiffCard
        turnDiff={decodeTurnDiff([
          { path: "README.md", kind: "modified", additions: 2, deletions: 1 },
        ])}
        isLatestTurn
        onOpen={vi.fn()}
      />,
    )

    expect(screen.getByText("1 changed file")).toBeTruthy()
    expect(screen.queryByText("1 changed files")).toBeNull()
    expect(screen.getByRole("button", { name: "Collapse folders" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open patch" })).toBeTruthy()
    expect(document.querySelector('[data-changed-files-state="expanded"]')).toBeTruthy()
  })

  it("montre une preview de scopes pour un gros diff du dernier Turn", () => {
    renderCard(
      <ThreadTurnDiffCard
        turnDiff={decodeTurnDiff([
          { path: "apps/web/src/App.tsx", kind: "modified", additions: 201, deletions: 20 },
          { path: "apps/web/src/App.test.tsx", kind: "modified", additions: 30, deletions: 2 },
          { path: "packages/shared/src/git.ts", kind: "modified", additions: 15, deletions: 4 },
          { path: "README.md", kind: "modified", additions: 3, deletions: 0 },
        ])}
        isLatestTurn
        onOpen={vi.fn()}
      />,
    )

    expect(document.querySelector('[data-changed-files-state="preview"]')).toBeTruthy()
    expect(screen.getByText("apps")).toBeTruthy()
    expect(screen.getByText("2 files")).toBeTruthy()
    expect(screen.getByText("packages")).toBeTruthy()
    expect(screen.getByText("root")).toBeTruthy()
    expect(screen.getByText("App.tsx")).toBeTruthy()
    expect(screen.getByText("git.ts")).toBeTruthy()
    expect(screen.getByText("README.md")).toBeTruthy()
    expect(screen.getByText("Show 4 files")).toBeTruthy()
    expect(screen.queryByText("App.test.tsx")).toBeNull()
  })

  it("garde les diffs plus anciens sur une ligne", () => {
    renderCard(
      <ThreadTurnDiffCard
        turnDiff={decodeTurnDiff([
          { path: "apps/web/src/App.tsx", kind: "modified", additions: 120, deletions: 20 },
        ])}
        onOpen={vi.fn()}
      />,
    )

    expect(document.querySelector('[data-changed-files-state="collapsed"]')).toBeTruthy()
    expect(screen.getByText("1 changed file")).toBeTruthy()
    expect(screen.queryByText("Show 1 file")).toBeNull()
    expect(screen.queryByText("App.tsx")).toBeNull()
  })

  it("compacte les dossiers et ouvre le fichier cliqué", async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    renderCard(
      <ThreadTurnDiffCard
        turnDiff={decodeTurnDiff([
          { path: "apps/web/src/index.ts", kind: "modified", additions: 2, deletions: 1 },
          { path: "apps/web/src/main.ts", kind: "modified", additions: 3, deletions: 0 },
        ])}
        isLatestTurn
        onOpen={onOpen}
      />,
    )

    expect(screen.getByText("apps/web/src")).toBeTruthy()
    expect(screen.getByText("index.ts")).toBeTruthy()
    expect(screen.getByText("main.ts")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /index\.ts/ }))
    expect(onOpen).toHaveBeenCalledWith("apps/web/src/index.ts")
  })

  it("replie la carte quand le Turn cesse d'être le dernier", () => {
    const turnDiff = decodeTurnDiff([
      { path: "README.md", kind: "modified", additions: 2, deletions: 1 },
    ])
    const { rerender } = renderCard(
      <ThreadTurnDiffCard turnDiff={turnDiff} isLatestTurn onOpen={vi.fn()} />,
    )

    expect(document.querySelector('[data-changed-files-state="expanded"]')).toBeTruthy()

    rerender(
      <AppAtomRegistryProvider>
        <TooltipProvider>
          <ThreadTurnDiffCard turnDiff={turnDiff} onOpen={vi.fn()} />
        </TooltipProvider>
      </AppAtomRegistryProvider>,
    )

    expect(document.querySelector('[data-changed-files-state="collapsed"]')).toBeTruthy()
    expect(screen.queryByText("README.md")).toBeNull()
  })
})
