// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { SidebarBrandTitlebar } from "../src/components/sidebar/SidebarBrandTitlebar"
import { SIDEBAR_TITLEBAR_INSET_CLASS } from "../src/lib/desktop-titlebar"

vi.mock("@blobatar/react", () => ({
  Blobatar: () => <span data-testid="blobatar" />,
}))

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window, "noyauDesktop", {
    configurable: true,
    value: undefined,
  })
})

const setReleaseChannel = (channel: "development" | "latest" | "nightly") => {
  Object.defineProperty(window, "noyauDesktop", {
    configurable: true,
    value: { releaseChannel: channel },
  })
}

describe("sidebar brand titlebar", () => {
  it("uses the desktop content-left token instead of a fixed px-3 left pad", () => {
    const { container } = render(<SidebarBrandTitlebar />)
    const titlebar = container.querySelector("[data-desktop-sidebar-titlebar]")

    expect(titlebar).not.toBeNull()
    expect(titlebar?.className).toContain(SIDEBAR_TITLEBAR_INSET_CLASS)
    expect(titlebar?.className.split(/\s+/)).not.toContain("px-3")
    expect(titlebar?.textContent).toContain("Noyau")
    expect(titlebar?.textContent).not.toContain("Noyau (")
    expect(screen.queryByRole("button", { name: "Noyau" })).toBeNull()
  })

  it("shows a nightly hint above the brand title on hover", async () => {
    setReleaseChannel("nightly")
    const user = userEvent.setup()
    render(<SidebarBrandTitlebar />)

    expect(screen.getByRole("button", { name: "Noyau" })).toBeTruthy()
    expect(screen.queryByText("Noyau (Nightly)")).toBeNull()

    await user.hover(screen.getByRole("button", { name: "Noyau" }))
    expect(await screen.findByText("nightly")).toBeTruthy()
  })

  it("shows a dev hint above the brand title on hover", async () => {
    setReleaseChannel("development")
    const user = userEvent.setup()
    render(<SidebarBrandTitlebar />)

    await user.hover(screen.getByRole("button", { name: "Noyau" }))
    expect(await screen.findByText("dev")).toBeTruthy()
  })
})
