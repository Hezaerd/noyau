// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"

import { SidebarBrandTitlebar } from "../src/components/sidebar/SidebarBrandTitlebar"

vi.mock("@blobatar/react", async () => {
  const React = await import("react")
  return {
    Blobatar: ({
      palette,
      background,
      contrast,
      ...rest
    }: {
      readonly palette?: { readonly head?: string; readonly eye?: string; readonly bg?: string }
      readonly background?: false | "circle" | "square"
      readonly contrast?: boolean
    }) =>
      React.createElement("span", {
        "data-testid": "blobatar",
        "data-head": palette?.head,
        "data-eye": palette?.eye,
        "data-bg": palette?.bg,
        "data-background": background === undefined ? "" : String(background),
        "data-contrast": contrast === undefined ? "" : String(contrast),
        ...rest,
      }),
  }
})

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

describe("sidebar brand blobatar palette", () => {
  it("paints nightly like the dock icon (bg + head + eye)", () => {
    setReleaseChannel("nightly")
    const { getByTestId } = render(<SidebarBrandTitlebar />)
    const blobatar = getByTestId("blobatar")
    expect(blobatar.getAttribute("data-bg")).toBe("#0a0a0e")
    expect(blobatar.getAttribute("data-head")).toBe("#302b4b")
    expect(blobatar.getAttribute("data-eye")).toBe("#e2ddff")
    expect(blobatar.getAttribute("data-background")).toBe("square")
    expect(blobatar.getAttribute("data-contrast")).toBe("false")
  })

  it("paints development ember from the release channel", () => {
    setReleaseChannel("development")
    const { getByTestId } = render(<SidebarBrandTitlebar />)
    const blobatar = getByTestId("blobatar")
    expect(blobatar.getAttribute("data-bg")).toBe("#1a1208")
    expect(blobatar.getAttribute("data-head")).toBe("#c45c26")
    expect(blobatar.getAttribute("data-eye")).toBe("#ffe7c2")
  })

  it("defaults to latest violet without a desktop bridge", () => {
    const { getByTestId } = render(<SidebarBrandTitlebar />)
    const blobatar = getByTestId("blobatar")
    expect(blobatar.getAttribute("data-bg")).toBe("#ebe9f4")
    expect(blobatar.getAttribute("data-head")).toBe("#6154e0")
    expect(blobatar.getAttribute("data-eye")).toBe("#f7f5ff")
  })
})
