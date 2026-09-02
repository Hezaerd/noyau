import { ThreadBranch, ThreadWorktreePath } from "@noyau/contracts/entities/checkout"
import { ContextUsage } from "@noyau/contracts/entities/context-usage"
import { Provider } from "@noyau/contracts/entities/environment"
import { ModelSelection } from "@noyau/contracts/entities/model-selection"
import { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import { Session } from "@noyau/contracts/entities/session"
import { LatestTurn } from "@noyau/contracts/entities/turn"
import { ProjectId, ThreadId, TurnId } from "@noyau/contracts/ids"
import { Schema } from "effect"

export const ThreadStatus = Schema.Literals(["active", "archived"])
export type ThreadStatus = (typeof ThreadStatus)["Type"]

/** Pin utilisateur du cycle settle. Absent = pas de pin ; l'auto-settle s'applique. */
export const SettledOverride = Schema.Literals(["settled", "active"])
export type SettledOverride = (typeof SettledOverride)["Type"]

/** Immutable ancestry of a native provider session fork. */
export const ThreadForkOrigin = Schema.Struct({
  sourceThreadId: ThreadId,
  sourceTurnId: TurnId,
})
export type ThreadForkOrigin = (typeof ThreadForkOrigin)["Type"]

/** Conversation provider titrée d'un Project. */
export class Thread extends Schema.Class<Thread>("@noyau/contracts/entities/Thread")({
  id: ThreadId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  provider: Provider,
  modelSelection: Schema.NullOr(ModelSelection),
  runtimeMode: RuntimeMode,
  branch: Schema.optionalKey(ThreadBranch),
  worktreePath: Schema.optionalKey(ThreadWorktreePath),
  status: ThreadStatus,
  session: Schema.NullOr(Session),
  latestTurn: Schema.NullOr(LatestTurn),
  contextUsage: Schema.optionalKey(ContextUsage),
  settledOverride: Schema.optionalKey(SettledOverride),
  settledAt: Schema.optionalKey(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
  /** Position dans la liste sidebar. Égal à createdAt jusqu'à un unsettle. */
  listedAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
  archivedAt: Schema.optionalKey(Schema.DateTimeUtcFromString),
  forkOrigin: Schema.optionalKey(ThreadForkOrigin),
}) {}

export const threadSettledOverrideOf = (
  thread: Pick<Thread, "settledOverride">,
): SettledOverride | null => thread.settledOverride ?? null

export const threadContextUsageOf = (thread: Pick<Thread, "contextUsage">): ContextUsage | null =>
  thread.contextUsage ?? null
