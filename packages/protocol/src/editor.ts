import { Schema } from "effect"

import { VcsScope } from "./git.ts"

export const EditorId = Schema.Literals(["cursor", "vscode", "zed"])
export type EditorId = (typeof EditorId)["Type"]

export class OpenInEditorFailed extends Schema.TaggedError<OpenInEditorFailed>()(
  "OpenInEditorFailed",
  {
    editor: EditorId,
    detail: Schema.NonEmptyString,
  },
) {}

export const OpenInEditorInput = Schema.Struct({
  ...VcsScope.fields,
  editor: EditorId,
})
export type OpenInEditorInput = (typeof OpenInEditorInput)["Type"]

export const OpenInEditorResult = Schema.Struct({
  editor: EditorId,
  cwd: Schema.NonEmptyString,
})
export type OpenInEditorResult = (typeof OpenInEditorResult)["Type"]

export const ListEditorsResult = Schema.Struct({
  editors: Schema.Array(EditorId),
})
export type ListEditorsResult = (typeof ListEditorsResult)["Type"]
