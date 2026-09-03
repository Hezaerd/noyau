// @vitest-environment happy-dom

import { ThreadId } from "@noyau/contracts/ids"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ThreadPageTitle } from "../src/components/WorkspaceBreadcrumb"
import { useKeybindingDispatcher } from "../src/hooks/use-keybinding-dispatcher"
import { resetKeybindingHandlersForTests } from "../src/state/keybinding-handlers"

function KeybindingHarness({ children }: { readonly children: ReactNode }) {
  useKeybindingDispatcher()
  return children
}

const buildAndDispatchCommand = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ details: undefined, ok: true as const, value: undefined })),
)

vi.mock("@/lib/control-plane", () => ({
  buildAndDispatchCommand,
}))

afterEach(() => {
  cleanup()
  resetKeybindingHandlersForTests()
  buildAndDispatchCommand.mockClear()
})

const threadId = ThreadId.make("20000000-0000-4000-8000-000000000001")
const threadTitle = "Exclure les subtrees du graphe"

const renderTitle = (props?: { readonly threadId?: ThreadId }) => {
  window.history.replaceState(
    {},
    "",
    `/projects/10000000-0000-4000-8000-000000000001/thread/${props?.threadId ?? threadId}`,
  )
  return render(
    <KeybindingHarness>
      <ThreadPageTitle
        projectName="noyau"
        threadId={props?.threadId ?? threadId}
        threadTitle={threadTitle}
      />
    </KeybindingHarness>,
  )
}

describe("Thread chrome title rename", () => {
  it("starts an inline rename from a double-click in the chrome", async () => {
    const user = userEvent.setup()
    renderTitle()

    await user.dblClick(screen.getByRole("heading", { name: threadTitle }))

    expect(screen.getByRole("textbox", { name: "Thread title" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: threadTitle })).toBeNull()
  })

  it("starts an inline rename from F2 on the Thread page", () => {
    renderTitle()

    fireEvent.keyDown(window, { key: "F2" })

    expect(screen.getByRole("textbox", { name: "Thread title" })).toBeTruthy()
  })

  it("commits a new title and leaves the chrome heading", async () => {
    const user = userEvent.setup()
    renderTitle()

    await user.dblClick(screen.getByRole("heading", { name: threadTitle }))
    const input = screen.getByRole("textbox", { name: "Thread title" })
    await user.clear(input)
    await user.type(input, "Titre mis à jour")
    await user.keyboard("{Enter}")

    expect(buildAndDispatchCommand).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("heading", { name: threadTitle })).toBeTruthy()
  })

  it("cancels with Escape without dispatching", async () => {
    const user = userEvent.setup()
    renderTitle()

    await user.dblClick(screen.getByRole("heading", { name: threadTitle }))
    await user.keyboard("{Escape}")

    expect(buildAndDispatchCommand).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: threadTitle })).toBeTruthy()
  })

  it("does not rename a draft Thread without an id", async () => {
    const user = userEvent.setup()
    window.history.replaceState({}, "", "/projects/10000000-0000-4000-8000-000000000001/thread/new")
    render(
      <KeybindingHarness>
        <ThreadPageTitle projectName="noyau" threadTitle="Nouveau Thread" />
      </KeybindingHarness>,
    )

    await user.dblClick(screen.getByRole("heading", { name: "Nouveau Thread" }))
    fireEvent.keyDown(window, { key: "F2" })

    expect(screen.queryByRole("textbox", { name: "Thread title" })).toBeNull()
    expect(buildAndDispatchCommand).not.toHaveBeenCalled()
  })
})
