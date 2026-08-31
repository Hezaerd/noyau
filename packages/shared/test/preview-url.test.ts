import { normalizePreviewUrl, previewPageTitle } from "@noyau/shared/preview-url"
import { describe, expect, it } from "vite-plus/test"

describe("normalizePreviewUrl", () => {
  it("accepts http(s) and adds http for host-only input", () => {
    expect(normalizePreviewUrl("https://noyau.example/path")).toBe("https://noyau.example/path")
    expect(normalizePreviewUrl("localhost:5173")).toBe("http://localhost:5173/")
    expect(normalizePreviewUrl("  127.0.0.1:3000/app  ")).toBe("http://127.0.0.1:3000/app")
  })

  it("rejects empty input and non-page schemes", () => {
    expect(normalizePreviewUrl("")).toBeNull()
    expect(normalizePreviewUrl("   ")).toBeNull()
    expect(normalizePreviewUrl("javascript:alert(1)")).toBeNull()
    expect(normalizePreviewUrl("file:///etc/passwd")).toBeNull()
    expect(normalizePreviewUrl("not a url ://")).toBeNull()
  })
})

describe("previewPageTitle", () => {
  it("uses the hostname when the URL parses", () => {
    expect(previewPageTitle("http://localhost:5173/")).toBe("localhost")
    expect(previewPageTitle("https://noyau.example/path")).toBe("noyau.example")
  })
})
