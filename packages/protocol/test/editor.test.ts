import { describe, expect, it } from "@effect/vitest"
import { EditorId, ListEditorsResult, OpenInEditorInput } from "@noyau/protocol/editor"
import { Schema } from "effect"

describe("editor contracts", () => {
  it("décode les éditeurs hôtes supportés", () => {
    expect(Schema.decodeSync(EditorId)("cursor")).toBe("cursor")
    expect(Schema.decodeSync(EditorId)("vscode")).toBe("vscode")
    expect(Schema.decodeSync(EditorId)("zed")).toBe("zed")
    expect(Schema.decodeSync(EditorId)("file-manager")).toBe("file-manager")
  })

  it("décode une ouverture scoped Project / Thread", () => {
    expect(
      Schema.decodeSync(OpenInEditorInput)({
        projectId: "10000000-0000-4000-8000-000000000001",
        editor: "cursor",
      }).threadId,
    ).toBeUndefined()
    expect(
      Schema.decodeSync(ListEditorsResult)({
        editors: ["cursor", "vscode"],
      }).editors,
    ).toEqual(["cursor", "vscode"])
  })
})
