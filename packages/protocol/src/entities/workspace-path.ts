import { Schema } from "effect"

export const WorkspacePathKind = Schema.Literals(["file", "directory"])
export type WorkspacePathKind = (typeof WorkspacePathKind)["Type"]

export const WorkspacePathEntry = Schema.Struct({
  path: Schema.NonEmptyString,
  kind: WorkspacePathKind,
})
export type WorkspacePathEntry = (typeof WorkspacePathEntry)["Type"]

export const WorkspacePathSearchResult = Schema.Struct({
  entries: Schema.Array(WorkspacePathEntry),
})
export type WorkspacePathSearchResult = (typeof WorkspacePathSearchResult)["Type"]
