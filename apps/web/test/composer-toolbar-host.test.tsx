// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { StrictMode, useRef, useState, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { ComposerToolbarHost } from "../src/components/thread/ComposerToolbarHost"
import { useComposerToolbar } from "../src/components/thread/use-composer-toolbar"

afterEach(cleanup)

function ToolbarOwner({
  id,
  placement,
  active = true,
  children,
}: {
  readonly id: string
  readonly placement: "top" | "bottom"
  readonly active?: boolean
  readonly children: ReactNode
}) {
  useComposerToolbar({ id, placement, active, content: children })
  return null
}

function LifecycleHarness() {
  const [active, setActive] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setActive(false)}>
        close
      </button>
      <ComposerToolbarHost>
        <ToolbarOwner id="owned" placement="bottom" active={active}>
          owned
        </ToolbarOwner>
      </ComposerToolbarHost>
    </>
  )
}

function DynamicOwner() {
  const [count, setCount] = useState(0)
  useComposerToolbar({
    id: "dynamic",
    placement: "top",
    active: true,
    content: <span data-dynamic-toolbar-content>{count}</span>,
  })
  return (
    <button type="button" aria-label="increment" onClick={() => setCount((value) => value + 1)}>
      increment {count}
    </button>
  )
}

function ReturnedCloseHarness() {
  const closeRef = useRef<(() => void) | undefined>(undefined)
  const toolbar = useComposerToolbar({
    id: "returned-close",
    placement: "top",
    content: "owned",
  })
  return (
    <>
      <button
        type="button"
        aria-label="open"
        onClick={() => {
          const result = toolbar.open()
          if (result.ok) {
            closeRef.current = result.close
          }
        }}
      />
      <button
        type="button"
        aria-label="release"
        onClick={() => {
          closeRef.current?.()
        }}
      />
      <span data-toolbar-state>{toolbar.isOpen ? "open" : "closed"}</span>
    </>
  )
}

describe("ComposerToolbarHost", () => {
  it("does not render empty placement wrappers", () => {
    const { container } = render(
      <ComposerToolbarHost>
        <span>composer</span>
      </ComposerToolbarHost>,
    )

    const host = container.querySelector('[data-slot="composer-toolbar-host"]')
    expect(host).toBeTruthy()
    expect(
      container.querySelector('[data-slot="composer-toolbar-area"][data-placement="top"]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-slot="composer-toolbar-area"][data-placement="bottom"]'),
    ).toBeNull()
    expect(host?.getAttribute("role")).toBeNull()
    expect(screen.getByText("composer")).toBeTruthy()
  })

  it("keeps the incumbent when a second owner requests the same placement", () => {
    render(
      <ComposerToolbarHost>
        <ToolbarOwner id="incumbent" placement="top">
          incumbent
        </ToolbarOwner>
        <ToolbarOwner id="challenger" placement="top">
          challenger
        </ToolbarOwner>
      </ComposerToolbarHost>,
    )

    expect(screen.getByText("incumbent")).toBeTruthy()
    expect(screen.queryByText("challenger")).toBeNull()
  })

  it("reports a typed failure for duplicate declarative owners", () => {
    const onOpenFailure = vi.fn()
    render(
      <ComposerToolbarHost
        toolbars={[
          { id: "duplicate", placement: "top", content: "incumbent" },
          {
            id: "duplicate",
            placement: "top",
            content: "challenger",
            onOpenFailure,
          },
        ]}
      >
        composer
      </ComposerToolbarHost>,
    )

    expect(screen.getByText("incumbent")).toBeTruthy()
    expect(screen.queryByText("challenger")).toBeNull()
    expect(onOpenFailure).toHaveBeenCalledWith({
      _tag: "ToolbarAreaOccupied",
      placement: "top",
      requestedId: "duplicate",
      occupantId: "duplicate",
    })
  })

  it("releases an active owner when its lifecycle closes", () => {
    const { container } = render(<LifecycleHarness />)
    const host = container.querySelector('[data-slot="composer-toolbar-host"]')
    expect(screen.getByText("owned")).toBeTruthy()
    expect(host?.getAttribute("data-bottom-toolbar-open")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "close" }))
    expect(screen.queryByText("owned")).toBeNull()
    expect(host?.getAttribute("data-bottom-toolbar-open")).toBe("false")
  })

  it("survives StrictMode effect cleanup and remount", () => {
    render(
      <StrictMode>
        <ComposerToolbarHost>
          <ToolbarOwner id="strict" placement="top">
            strict
          </ToolbarOwner>
        </ComposerToolbarHost>
      </StrictMode>,
    )

    expect(screen.getByText("strict")).toBeTruthy()
  })

  it("updates hook state when the returned close handle is called", () => {
    render(
      <ComposerToolbarHost>
        <ReturnedCloseHarness />
      </ComposerToolbarHost>,
    )

    fireEvent.click(screen.getByRole("button", { name: "open" }))
    expect(screen.getByText("owned")).toBeTruthy()
    expect(screen.getByText("open")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "release" }))
    expect(screen.queryByText("owned")).toBeNull()
    expect(screen.getByText("closed")).toBeTruthy()
  })

  it("updates dynamic content without refreshing the owner forever", async () => {
    render(
      <ComposerToolbarHost>
        <DynamicOwner />
      </ComposerToolbarHost>,
    )
    expect(screen.getByText("0")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "increment" }))

    await waitFor(() => {
      expect(screen.getByText("1")).toBeTruthy()
    })
  })
})
