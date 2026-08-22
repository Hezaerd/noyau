import { describe, expect, it } from "@effect/vitest"
import { hostEditorOf, resolveEditorLaunch } from "@noyau/server/editor/editor-open"

describe("EditorOpen helpers", () => {
  it("résout le lancement d’un éditeur hôte sur le cwd", () => {
    expect(resolveEditorLaunch(hostEditorOf("cursor"), "cursor", "/tmp/repo")).toEqual({
      command: "cursor",
      args: ["/tmp/repo"],
      editor: "cursor",
    })
    expect(resolveEditorLaunch(hostEditorOf("vscode"), "code", "/tmp/repo").command).toBe("code")
    expect(resolveEditorLaunch(hostEditorOf("zed"), "zeditor", "/tmp/repo").command).toBe("zeditor")
  })
})
