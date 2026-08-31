// @vitest-environment happy-dom

import { ShellSnapshot } from "@noyau/contracts/shell"
import { cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { ThreadSidebarPopover } from "../src/components/sidebar/ThreadSidebarPopover"
import { catalogModels, threadModelLabel } from "../src/lib/thread-sidebar-popover"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { replaceAppliedShell, resetAppliedShell } from "../src/state/shell"
import { encodedTestEnvironment } from "./encoded-environment"

const makeSnapshot = (
  cursorModels: ReadonlyArray<{
    readonly modelId: string
    readonly label: string
    readonly reasoningEfforts: ReadonlyArray<never>
    readonly serviceTiers: ReadonlyArray<never>
  }>,
  codexModels: ReadonlyArray<{
    readonly modelId: string
    readonly label: string
    readonly reasoningEfforts: ReadonlyArray<never>
    readonly serviceTiers: ReadonlyArray<never>
  }> = [],
) =>
  Schema.decodeSync(ShellSnapshot)({
    snapshotSequence: 1,
    environment: encodedTestEnvironment({
      cursorModels,
      codexModels,
    }),
    projects: [],
    threads: [],
  })

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
  resetAppliedShell()
})

const renderPopover = (ui: Parameters<typeof render>[0]) =>
  render(<AppAtomRegistryProvider>{ui}</AppAtomRegistryProvider>)

describe("threadModelLabel", () => {
  it("uses the catalog label when the model is known", () => {
    expect(
      threadModelLabel({ modelId: "grok-4.6" }, [
        { modelId: "grok-4.6", label: "Grok 4.6" },
        { modelId: "composer-2.5", label: "Composer 2.5" },
      ]),
    ).toBe("Grok 4.6")
  })

  it("falls back to modelId when the catalog has no match", () => {
    expect(threadModelLabel({ modelId: "grok-4.6" }, [])).toBe("grok-4.6")
  })

  it("falls back to Auto when no selection", () => {
    expect(threadModelLabel(null, [{ modelId: "grok-4.6", label: "Grok 4.6" }])).toBe("Auto")
  })
})

describe("catalogModels", () => {
  it("prend le catalogue du provider du Thread", () => {
    expect(
      catalogModels("cursor", {
        cursor: [{ modelId: "composer-2.5", label: "Composer 2.5" }],
        claude: [{ modelId: "claude-opus-5", label: "Claude Opus 5" }],
        codex: [{ modelId: "gpt-5", label: "GPT-5" }],
      }),
    ).toEqual([{ modelId: "composer-2.5", label: "Composer 2.5" }])
    expect(
      catalogModels("claude", {
        cursor: [{ modelId: "composer-2.5", label: "Composer 2.5" }],
        claude: [{ modelId: "claude-opus-5", label: "Claude Opus 5" }],
        codex: [{ modelId: "gpt-5", label: "GPT-5" }],
      }),
    ).toEqual([{ modelId: "claude-opus-5", label: "Claude Opus 5" }])
    expect(
      catalogModels("codex", {
        cursor: [{ modelId: "composer-2.5", label: "Composer 2.5" }],
        claude: [{ modelId: "claude-opus-5", label: "Claude Opus 5" }],
        codex: [{ modelId: "gpt-5", label: "GPT-5" }],
      }),
    ).toEqual([{ modelId: "gpt-5", label: "GPT-5" }])
  })

  it("tolère un catalogue manquant", () => {
    expect(catalogModels("codex", { codex: [{ modelId: "gpt-5", label: "GPT-5" }] })).toEqual([
      { modelId: "gpt-5", label: "GPT-5" },
    ])
  })
})

describe("ThreadSidebarPopover", () => {
  it("shows title, project, branch and provider icon with the model label", () => {
    replaceAppliedShell(
      makeSnapshot([
        {
          modelId: "grok-4.6",
          label: "Grok 4.6",
          reasoningEfforts: [],
          serviceTiers: [],
        },
      ]),
    )

    renderPopover(
      <ThreadSidebarPopover
        thread={{
          title: "Stores Zustand t3code vs shell",
          provider: "cursor",
          modelSelection: { modelId: "grok-4.6" },
        }}
        project={{ name: "noyau" }}
        branch="t3code/effect-atom-renderer-state"
      />,
    )

    expect(screen.getByText("Stores Zustand t3code vs shell")).toBeTruthy()
    expect(screen.getByText("noyau")).toBeTruthy()
    expect(screen.getByText("t3code/effect-atom-renderer-state")).toBeTruthy()
    expect(screen.getByText("Grok 4.6")).toBeTruthy()
    expect(screen.queryByText("Cursor")).toBeNull()
    expect(screen.queryByText("MacBook Air de Yanne")).toBeNull()
  })

  it("résout le label via le catalogue du provider du Thread", () => {
    replaceAppliedShell(
      makeSnapshot(
        [
          {
            modelId: "gpt-5",
            label: "GPT-5 Cursor",
            reasoningEfforts: [],
            serviceTiers: [],
          },
        ],
        [
          {
            modelId: "gpt-5",
            label: "GPT-5 Codex",
            reasoningEfforts: [],
            serviceTiers: [],
          },
        ],
      ),
    )

    renderPopover(
      <ThreadSidebarPopover
        thread={{
          title: "Thread Codex",
          provider: "codex",
          modelSelection: { modelId: "gpt-5" },
        }}
        project={{ name: "noyau" }}
        branch={null}
      />,
    )

    expect(screen.getByText("GPT-5 Codex")).toBeTruthy()
    expect(screen.queryByText("GPT-5 Cursor")).toBeNull()
  })

  it("omits the branch row and falls back to Auto without a selection", () => {
    renderPopover(
      <ThreadSidebarPopover
        thread={{
          title: "Nouveau Thread",
          provider: "cursor",
          modelSelection: null,
        }}
        project={{ name: "noyau" }}
        branch={null}
      />,
    )

    expect(screen.getByText("Nouveau Thread")).toBeTruthy()
    expect(screen.getByText("noyau")).toBeTruthy()
    expect(screen.getByText("Auto")).toBeTruthy()
    expect(screen.queryByText("Cursor")).toBeNull()
  })
})
