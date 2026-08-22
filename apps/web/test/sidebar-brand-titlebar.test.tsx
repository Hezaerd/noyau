// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
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
})

describe("sidebar brand titlebar", () => {
  it("uses the desktop content-left token instead of a fixed px-3 left pad", () => {
    const { container } = render(<SidebarBrandTitlebar />)
    const titlebar = container.querySelector("[data-desktop-sidebar-titlebar]")

    expect(titlebar).not.toBeNull()
    expect(titlebar?.className).toContain(SIDEBAR_TITLEBAR_INSET_CLASS)
    expect(titlebar?.className.split(/\s+/)).not.toContain("px-3")
    expect(titlebar?.textContent).toContain("Noyau")
  })

  it("labels a nightly desktop session", () => {
    Object.defineProperty(window, "noyauDesktop", {
      configurable: true,
      value: { releaseChannel: "nightly" },
    })
    const { container } = render(<SidebarBrandTitlebar />)
    expect(container.textContent).toContain("Noyau (Nightly)")
    Object.defineProperty(window, "noyauDesktop", {
      configurable: true,
      value: undefined,
    })
  })
})
