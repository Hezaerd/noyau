import { describe, expect, it } from "vite-plus/test"

import { resolveFolderPickerDefaultPath } from "./folder-picker"

describe("resolveFolderPickerDefaultPath", () => {
  const homeDirectory = "/Users/moi"

  it("uses the home directory for an absent or empty preference", () => {
    expect(resolveFolderPickerDefaultPath(undefined, homeDirectory)).toBe(homeDirectory)
    expect(resolveFolderPickerDefaultPath("  ", homeDirectory)).toBe(homeDirectory)
    expect(resolveFolderPickerDefaultPath("~", homeDirectory)).toBe(homeDirectory)
  })

  it("expands a home-relative path and resolves other paths", () => {
    expect(resolveFolderPickerDefaultPath("~/Developer", homeDirectory)).toBe(
      "/Users/moi/Developer",
    )
    expect(resolveFolderPickerDefaultPath("Projects", homeDirectory)).toBe("Projects")
  })
})
