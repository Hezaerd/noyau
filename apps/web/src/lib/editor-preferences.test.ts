import { describe, expect, it } from "vite-plus/test"

import { resolvePreferredEditor } from "./editor-preferences"

describe("editor-preferences", () => {
  it("garde l’éditeur mémorisé s’il est encore disponible", () => {
    expect(resolvePreferredEditor(["cursor", "vscode"], "vscode")).toBe("vscode")
  })

  it("retombe sur le premier éditeur disponible", () => {
    expect(resolvePreferredEditor(["zed"], "cursor")).toBe("zed")
    expect(resolvePreferredEditor([], "cursor")).toBeNull()
  })
})
