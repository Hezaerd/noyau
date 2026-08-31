import { describe, expect, it } from "vite-plus/test"

import { browserTabTitle, browserTabUrl, normalizeBrowserUrl } from "../src/lib/browser-url"

describe("normalizeBrowserUrl", () => {
  it("accepts http(s) and adds http for host-only input", () => {
    expect(normalizeBrowserUrl("https://noyau.example/path")).toBe("https://noyau.example/path")
    expect(normalizeBrowserUrl("localhost:5173")).toBe("http://localhost:5173/")
    expect(normalizeBrowserUrl("  127.0.0.1:3000/app  ")).toBe("http://127.0.0.1:3000/app")
  })

  it("rejects empty input and non-page schemes", () => {
    expect(normalizeBrowserUrl("")).toBeNull()
    expect(normalizeBrowserUrl("   ")).toBeNull()
    expect(normalizeBrowserUrl("javascript:alert(1)")).toBeNull()
    expect(normalizeBrowserUrl("file:///etc/passwd")).toBeNull()
    expect(normalizeBrowserUrl("not a url ://")).toBeNull()
  })
})

describe("browserTabUrl", () => {
  it("reads a committed URL and treats missing or invalid values as empty", () => {
    expect(browserTabUrl({ url: "http://localhost:5173/" })).toBe("http://localhost:5173/")
    expect(browserTabUrl({ url: null })).toBeNull()
    expect(browserTabUrl({})).toBeNull()
    expect(browserTabUrl({ url: 1 })).toBeNull()
  })
})

describe("browserTabTitle", () => {
  it("uses the hostname when the URL parses", () => {
    expect(browserTabTitle(null)).toBe("Browser")
    expect(browserTabTitle("http://localhost:5173/")).toBe("localhost")
    expect(browserTabTitle("https://noyau.example/path")).toBe("noyau.example")
  })
})
