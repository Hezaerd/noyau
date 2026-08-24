import { describe, expect, it } from "vite-plus/test"

import { brandBlobatarPalette } from "../src/lib/brand-blobatar"

describe("brand blobatar palette", () => {
  it("is fixed per channel and ignores the UI theme", () => {
    expect(brandBlobatarPalette()).toEqual({
      bg: "#ebe9f4",
      head: "#6154e0",
      eye: "#f7f5ff",
    })
    expect(brandBlobatarPalette("latest")).toEqual({
      bg: "#ebe9f4",
      head: "#6154e0",
      eye: "#f7f5ff",
    })
    expect(brandBlobatarPalette("nightly")).toEqual({
      bg: "#0a0a0e",
      head: "#302b4b",
      eye: "#e2ddff",
    })
    expect(brandBlobatarPalette("development")).toEqual({
      bg: "#1a1208",
      head: "#c45c26",
      eye: "#ffe7c2",
    })
  })
})
