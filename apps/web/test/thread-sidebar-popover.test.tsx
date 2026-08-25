// @vitest-environment happy-dom

import { emptyCursorProviderStatus } from "@noyau/protocol/entities/environment"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vite-plus/test"

import { ThreadSidebarPopover } from "../src/components/sidebar/ThreadSidebarPopover"
import {
  getControlPlaneSnapshot,
  publishControlPlaneSnapshot,
} from "../src/lib/control-plane-store"
import { EMPTY_THREAD_SHELL_INDEX } from "../src/lib/thread-shell-index"
import { threadModelLabel } from "../src/lib/thread-sidebar-popover"

const emptyStore = getControlPlaneSnapshot()

afterEach(() => {
  cleanup()
  publishControlPlaneSnapshot(emptyStore)
})

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

describe("ThreadSidebarPopover", () => {
  it("shows title, project, branch and provider icon with the model label", () => {
    publishControlPlaneSnapshot({
      ...EMPTY_THREAD_SHELL_INDEX,
      shell: undefined,
      cursor: {
        ...emptyCursorProviderStatus,
        models: [
          {
            modelId: "grok-4.6",
            label: "Grok 4.6",
            reasoningEfforts: [],
            serviceTiers: [],
          },
        ],
      },
      projects: [],
      threads: [],
      lastProjectId: undefined,
      subscriptionStatus: undefined,
      selectProject: () => undefined,
    })

    render(
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
    render(
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
