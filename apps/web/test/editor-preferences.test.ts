import { describe, expect, it } from "vite-plus/test"

import { editorLabel, resolvePreferredEditor } from "../src/lib/editor-preferences"

describe("editor-preferences", () => {
  it("garde l’éditeur mémorisé s’il est encore disponible", () => {
    expect(resolvePreferredEditor(["cursor", "vscode"], "vscode")).toBe("vscode")
    expect(resolvePreferredEditor(["cursor", "file-manager"], "file-manager")).toBe("file-manager")
  })

  it("retombe sur le premier éditeur disponible", () => {
    expect(resolvePreferredEditor(["zed"], "cursor")).toBe("zed")
    expect(resolvePreferredEditor([], "cursor")).toBeNull()
  })

  it("libellé du file-manager selon la plateforme", () => {
    expect(editorLabel("file-manager", "mac")).toBe("Finder")
    expect(editorLabel("file-manager", "windows")).toBe("Explorer")
    expect(editorLabel("file-manager", "linux")).toBe("Files")
    expect(editorLabel("cursor", "mac")).toBe("Cursor")
  })
})
