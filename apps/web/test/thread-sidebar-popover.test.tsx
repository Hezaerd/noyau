// @vitest-environment happy-dom

import { EnvironmentId } from "@noyau/protocol/ids"
import { ShellSnapshot } from "@noyau/protocol/shell"
import { cleanup, render, screen } from "@testing-library/react"
import { Schema } from "effect"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { ThreadSidebarPopover } from "../src/components/sidebar/ThreadSidebarPopover"
import { catalogModels, threadModelLabel } from "../src/lib/thread-sidebar-popover"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"
import { replaceAppliedShell, resetAppliedShell } from "../src/state/shell"

const makeSnapshot = (models: ShellSnapshot["environment"]["cursor"]["models"]) =>
  Schema.decodeSync(ShellSnapshot)({
    snapshotSequence: 1,
    environment: {
      id: EnvironmentId.make("30000000-0000-4000-8000-000000000001"),
      cursor: {
        installed: false,
        handshakeOk: false,
        version: null,
        plan: null,
        binaryPath: null,
        models,
      },
      codex: {
        installed: false,
        handshakeOk: false,
        version: null,
        plan: null,
        binaryPath: null,
        models: [],
      },
      createdAt: "2026-08-25T12:00:00.000Z",
    },
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
  it("concatène les catalogues Cursor et Codex", () => {
    expect(
      catalogModels(
        [{ modelId: "composer-2.5", label: "Composer 2.5" }],
        [{ modelId: "gpt-5", label: "GPT-5" }],
      ),
    ).toEqual([
      { modelId: "composer-2.5", label: "Composer 2.5" },
      { modelId: "gpt-5", label: "GPT-5" },
    ])
  })

  it("tolère un catalogue manquant", () => {
    expect(catalogModels(undefined, [{ modelId: "gpt-5", label: "GPT-5" }])).toEqual([
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
