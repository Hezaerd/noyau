import { describe, expect, it } from "@effect/vitest"
import {
  availableEditorIds,
  fileManagerCommandForPlatform,
  hostEditorOf,
  resolveEditorLaunch,
} from "@noyau/server/editor/editor-open"

describe("EditorOpen helpers", () => {
  it("résout le lancement d’un éditeur hôte sur le cwd", () => {
    expect(resolveEditorLaunch(hostEditorOf("cursor"), "cursor", "/tmp/repo")).toEqual({
      command: "cursor",
      args: ["/tmp/repo"],
      editor: "cursor",
    })
    expect(resolveEditorLaunch(hostEditorOf("vscode"), "code", "/tmp/repo").command).toBe("code")
    expect(resolveEditorLaunch(hostEditorOf("zed"), "zeditor", "/tmp/repo").command).toBe("zeditor")
    expect(resolveEditorLaunch(hostEditorOf("file-manager"), "open", "/tmp/repo")).toEqual({
      command: "open",
      args: ["/tmp/repo"],
      editor: "file-manager",
    })
  })

  it("choisit la commande file-manager de la plateforme", () => {
    expect(fileManagerCommandForPlatform("darwin")).toBe("open")
    expect(fileManagerCommandForPlatform("win32")).toBe("explorer")
    expect(fileManagerCommandForPlatform("linux")).toBe("xdg-open")
  })

  it("liste le file-manager quand la commande plateforme est sur le PATH", () => {
    expect(availableEditorIds((command) => command === "open", "darwin")).toEqual(["file-manager"])
    expect(
      availableEditorIds((command) => command === "explorer" || command === "cursor", "win32"),
    ).toEqual(["cursor", "file-manager"])
  })
})
