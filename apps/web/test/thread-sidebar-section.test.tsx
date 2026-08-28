// @vitest-environment happy-dom

import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { ThreadShell } from "@noyau/contracts/shell"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ThreadSidebarSection } from "../src/components/sidebar/ThreadSidebarSection"
import { AppAtomRegistryProvider, resetAppAtomRegistryForTests } from "../src/state/atom-registry"

const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
const activeId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const settledId = ThreadId.make("20000000-0000-4000-8000-000000000002")
const otherSettledId = ThreadId.make("20000000-0000-4000-8000-000000000003")
const turnId = TurnId.make("30000000-0000-4000-8000-000000000001")

const makeShell = (id: ThreadId, title: string): ThreadShell =>
  Schema.decodeSync(ThreadShell)({
    id,
    projectId,
    title,
    provider: "cursor",
    modelSelection: null,
    runtimeMode: "full-access",
    status: "active",
    latestTurn: {
      turnId,
      state: "completed",
      requestedAt: "2026-08-20T12:00:00.000Z",
      startedAt: "2026-08-20T12:00:00.000Z",
      completedAt: "2026-08-20T12:00:00.000Z",
    },
    sessionStatus: "ready",
    lastError: null,
    createdAt: "2026-08-20T12:00:00.000Z",
    listedAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
  })

interface SidebarQueuesFixture {
  active: ThreadShell[]
  settled: ThreadShell[]
}

const queues = vi.hoisted((): SidebarQueuesFixture => ({
  active: [],
  settled: [],
}))

vi.mock("@/hooks/use-sidebar-queues", () => ({
  useSidebarQueues: () => queues,
}))

afterEach(() => {
  cleanup()
  resetAppAtomRegistryForTests()
  queues.active = []
  queues.settled = []
})

const renderSection = () =>
  render(
    <AppAtomRegistryProvider>
      <ThreadSidebarSection
        projectId={projectId}
        renderThread={(thread) => <div>{thread.title}</div>}
      />
    </AppAtomRegistryProvider>,
  )

describe("ThreadSidebarSection settled shelf", () => {
  it("hides settled rows while collapsed and shows the count", () => {
    queues.active = [makeShell(activeId, "Inbox thread")]
    queues.settled = [makeShell(settledId, "Settled one"), makeShell(otherSettledId, "Settled two")]

    renderSection()

    expect(screen.getByRole("button", { name: "Settled (2)" }).getAttribute("aria-expanded")).toBe(
      "false",
    )
    expect(screen.getByText("Inbox thread")).toBeTruthy()
    expect(screen.queryByText("Settled one")).toBeNull()
    expect(screen.queryByText("Settled two")).toBeNull()
  })

  it("reveals settled rows after expanding", async () => {
    queues.settled = [makeShell(settledId, "Settled one"), makeShell(otherSettledId, "Settled two")]
    const user = userEvent.setup()

    renderSection()
    await user.click(screen.getByTestId("sidebar-settled-shelf-toggle"))

    expect(screen.getByRole("button", { name: "Settled (2)" }).getAttribute("aria-expanded")).toBe(
      "true",
    )
    expect(screen.getByText("Settled one")).toBeTruthy()
    expect(screen.getByText("Settled two")).toBeTruthy()
  })

  it("lists a non-empty /thread/new draft when there are no persisted Threads", () => {
    render(
      <AppAtomRegistryProvider>
        <ThreadSidebarSection
          projectId={projectId}
          draft={<div>Fix the sidebar draft</div>}
          renderThread={(thread) => <div>{thread.title}</div>}
        />
      </AppAtomRegistryProvider>,
    )

    expect(screen.getByText("Threads")).toBeTruthy()
    expect(screen.getByText("Fix the sidebar draft")).toBeTruthy()
  })

  it("hides settled rows after collapsing", async () => {
    queues.settled = [makeShell(settledId, "Settled one"), makeShell(otherSettledId, "Settled two")]
    const user = userEvent.setup()

    renderSection()
    await user.click(screen.getByTestId("sidebar-settled-shelf-toggle"))
    await user.click(screen.getByTestId("sidebar-settled-shelf-toggle"))

    expect(screen.getByRole("button", { name: "Settled (2)" }).getAttribute("aria-expanded")).toBe(
      "false",
    )
    expect(screen.queryByText("Settled one")).toBeNull()
    expect(screen.queryByText("Settled two")).toBeNull()
  })
})
