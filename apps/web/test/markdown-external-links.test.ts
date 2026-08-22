import { describe, expect, it } from "vite-plus/test"

import {
  markdownExternalLinkFaviconSrc,
  resolveExternalWebLinkHost,
} from "../src/lib/markdown-external-links"

describe("resolveExternalWebLinkHost", () => {
  it.each([
    ["https://github.com/Hezaerd/noyau/pull/200", "github.com"],
    ["http://example.com/docs", "example.com"],
    ["https://www.google.com/s2/favicons?domain=github.com", "www.google.com"],
    ["#heading", null],
    ["file:///tmp/example.txt", null],
    ["javascript:void(0)", null],
    ["not a URL", null],
    [undefined, null],
    ["", null],
  ] as const)("resolves %s as %s", (href, expected) => {
    expect(resolveExternalWebLinkHost(href)).toBe(expected)
  })

  it("builds the Google favicon URL for a host", () => {
    expect(markdownExternalLinkFaviconSrc("github.com")).toBe(
      "https://www.google.com/s2/favicons?domain=github.com&sz=32",
    )
  })
})
