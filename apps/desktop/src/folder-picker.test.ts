import { describe, expect, it } from "vite-plus/test"

import {
  folderPickerOpenDialogOptions,
  folderPickerOwner,
  resolveFolderPickerDefaultPath,
  selectedFolderPath,
} from "./folder-picker"

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

describe("folder picker dialog owner", () => {
  it("attaches only to a live window", () => {
    const live = { isDestroyed: () => false }
    const destroyed = { isDestroyed: () => true }

    expect(folderPickerOwner(live)).toBe(live)
    expect(folderPickerOwner(destroyed)).toBeUndefined()
    expect(folderPickerOwner(null)).toBeUndefined()
  })

  it("maps a native dialog result to a selected path", () => {
    expect(selectedFolderPath({ canceled: true, filePaths: ["/tmp/repo"] })).toBeUndefined()
    expect(selectedFolderPath({ canceled: false, filePaths: ["/tmp/repo"] })).toBe("/tmp/repo")
    expect(folderPickerOpenDialogOptions("/Users/moi")).toEqual({
      defaultPath: "/Users/moi",
      properties: ["openDirectory"],
    })
  })
})
