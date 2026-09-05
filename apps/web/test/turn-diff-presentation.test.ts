import { describe, expect, it } from "vitest"

import {
  changedFileName,
  selectChangedFilePreview,
  shouldAutoExpandChangedFiles,
  summarizeChangedFileScopes,
} from "../src/lib/turn-diff-presentation.ts"

describe("présentation TurnDiff", () => {
  it("n'auto-expand que les petits diffs du dernier Turn", () => {
    const smallFiles = [
      { path: "src/a.ts", additions: 80, deletions: 20 },
      { path: "src/b.ts", additions: 60, deletions: 20 },
    ]

    expect(shouldAutoExpandChangedFiles(smallFiles, true)).toBe(true)
    expect(shouldAutoExpandChangedFiles(smallFiles, false)).toBe(false)
    expect(
      shouldAutoExpandChangedFiles([{ path: "src/a.ts", additions: 201, deletions: 0 }], true),
    ).toBe(false)
    expect(
      shouldAutoExpandChangedFiles(
        Array.from({ length: 6 }, (_, index) => ({
          path: `src/${index}.ts`,
          additions: 1,
          deletions: 0,
        })),
        true,
      ),
    ).toBe(false)
  })

  it("résume les scopes de premier niveau les plus présents", () => {
    const files = [
      { path: "apps/web/src/App.tsx", additions: 1, deletions: 0 },
      { path: "README.md", additions: 1, deletions: 0 },
      { path: "apps/server/src/index.ts", additions: 1, deletions: 0 },
      { path: "packages/shared/src/git.ts", additions: 1, deletions: 0 },
      { path: "apps\\mobile\\App.tsx", additions: 1, deletions: 0 },
    ]

    expect(summarizeChangedFileScopes(files)).toEqual([
      { label: "apps", fileCount: 3 },
      { label: "root", fileCount: 1 },
      { label: "packages", fileCount: 1 },
    ])
  })

  it("prévisualise d'abord un fichier par scope", () => {
    const files = [
      { path: "apps/web/src/App.tsx", additions: 1, deletions: 0 },
      { path: "apps/web/src/App.test.tsx", additions: 1, deletions: 0 },
      { path: "packages/shared/src/git.ts", additions: 1, deletions: 0 },
      { path: "README.md", additions: 1, deletions: 0 },
    ]

    expect(selectChangedFilePreview(files).map((file) => file.path)).toEqual([
      "apps/web/src/App.tsx",
      "packages/shared/src/git.ts",
      "README.md",
    ])
    expect(changedFileName("apps\\web\\src\\App.tsx")).toBe("App.tsx")
  })

  it("ne fusionne pas README.md avec un dossier root/", () => {
    const files = [
      { path: "README.md", additions: 1, deletions: 0 },
      { path: "root/index.ts", additions: 2, deletions: 0 },
    ]

    expect(summarizeChangedFileScopes(files)).toEqual([
      { label: "root", fileCount: 1 },
      { label: "root", fileCount: 1 },
    ])
    expect(selectChangedFilePreview(files).map((file) => file.path)).toEqual([
      "README.md",
      "root/index.ts",
    ])
  })
})
