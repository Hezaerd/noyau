import { describe, expect, it } from "vite-plus/test"

import { brandBlobatarPalette } from "../src/lib/brand-blobatar"

describe("brand blobatar palette", () => {
  it("is fixed per channel and ignores the UI theme", () => {
    expect(brandBlobatarPalette()).toEqual({ head: "#6154e0", eye: "#f7f5ff" })
    expect(brandBlobatarPalette("latest")).toEqual({ head: "#6154e0", eye: "#f7f5ff" })
    expect(brandBlobatarPalette("nightly")).toEqual({ head: "#302b4b", eye: "#e2ddff" })
    expect(brandBlobatarPalette("development")).toEqual({ head: "#c45c26", eye: "#ffe7c2" })
  })
})
