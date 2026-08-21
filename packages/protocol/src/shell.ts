import { Environment, Provider, WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { SessionStatus } from "@noyau/protocol/entities/session"
import { ThreadStatus } from "@noyau/protocol/entities/thread"
import { LatestTurn } from "@noyau/protocol/entities/turn"
import { ProjectId, Sequence, ThreadId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const ProjectShell = Schema.Struct({
  id: ProjectId,
  name: Schema.NonEmptyString,
  workspaceRoot: WorkspaceRoot,
  available: Schema.Boolean,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
})
export type ProjectShell = (typeof ProjectShell)["Type"]

export const ThreadShell = Schema.Struct({
  id: ThreadId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  provider: Provider,
  runtimeMode: RuntimeMode,
  status: ThreadStatus,
  latestTurn: Schema.NullOr(LatestTurn),
  sessionStatus: Schema.NullOr(SessionStatus),
  lastError: Schema.NullOr(Schema.NonEmptyString),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
})
export type ThreadShell = (typeof ThreadShell)["Type"]

export const ShellSnapshot = Schema.Struct({
  snapshotSequence: Sequence,
  environment: Environment,
  projects: Schema.Array(ProjectShell),
  threads: Schema.Array(ThreadShell),
})
export type ShellSnapshot = (typeof ShellSnapshot)["Type"]

export const ShellLiveEvent = Schema.Union([
  Schema.TaggedStruct("project-upserted", {
    sequence: Sequence,
    project: ProjectShell,
  }),
  Schema.TaggedStruct("project-removed", {
    sequence: Sequence,
    projectId: ProjectId,
  }),
  Schema.TaggedStruct("thread-upserted", {
    sequence: Sequence,
    thread: ThreadShell,
  }),
  Schema.TaggedStruct("thread-removed", {
    sequence: Sequence,
    threadId: ThreadId,
  }),
])
export type ShellLiveEvent = (typeof ShellLiveEvent)["Type"]

/** Vue UI volatile. Pas un fait du journal. */
export const ShellFocus = Schema.Union([
  Schema.TaggedStruct("idle", {}),
  Schema.TaggedStruct("tableau", {
    projectId: ProjectId,
  }),
  Schema.TaggedStruct("thread", {
    projectId: ProjectId,
    threadId: ThreadId,
  }),
])
export type ShellFocus = (typeof ShellFocus)["Type"]

export const SetShellFocusInput = Schema.Struct({
  enabled: Schema.Boolean,
  focus: ShellFocus,
})
export type SetShellFocusInput = (typeof SetShellFocusInput)["Type"]
