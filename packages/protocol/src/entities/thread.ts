import { Provider } from "@noyau/protocol/entities/environment"
import { ModelSelection } from "@noyau/protocol/entities/model-selection"
import { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import { Session } from "@noyau/protocol/entities/session"
import { LatestTurn } from "@noyau/protocol/entities/turn"
import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { Schema } from "effect"

export const ThreadStatus = Schema.Literals(["active", "archived"])
export type ThreadStatus = (typeof ThreadStatus)["Type"]

/** Conversation provider titrée d'un Project. */
export class Thread extends Schema.Class<Thread>("@noyau/protocol/entities/Thread")({
  id: ThreadId,
  projectId: ProjectId,
  title: Schema.NonEmptyString,
  provider: Provider,
  modelSelection: Schema.NullOr(ModelSelection),
  runtimeMode: RuntimeMode,
  status: ThreadStatus,
  session: Schema.NullOr(Session),
  latestTurn: Schema.NullOr(LatestTurn),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
  archivedAt: Schema.optionalKey(Schema.DateTimeUtcFromString),
}) {}
