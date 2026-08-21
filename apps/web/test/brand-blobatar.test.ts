import { describe, expect, it } from "vite-plus/test"

import { brandBlobatarPalette } from "../src/lib/brand-blobatar"

describe("brand blobatar palette", () => {
  it("uses the theme tokens for each appearance", () => {
    expect(brandBlobatarPalette("light")).toEqual({ head: "#6154e0", eye: "#f7f5ff" })
    expect(brandBlobatarPalette("dark")).toEqual({ head: "#302b4b", eye: "#e2ddff" })
  })
})
