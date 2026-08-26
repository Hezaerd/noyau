import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { DefaultModelSelection } from "@noyau/protocol/entities/model-selection"
import {
  ActorId,
  CommandId,
  CorrelationId,
  EventId,
  ProjectId,
  SchemaVersion,
} from "@noyau/protocol/ids"
import { BoardInitialization } from "@noyau/protocol/ticket/commands"
import { Schema } from "effect"

const requestMeta = {
  commandId: CommandId,
  causationId: Schema.optionalKey(EventId),
} as const

const commandMeta = {
  commandId: CommandId,
  projectId: ProjectId,
  actorId: ActorId,
  correlationId: CorrelationId,
  causationId: Schema.optionalKey(EventId),
  issuedAt: Schema.DateTimeUtcFromString,
  schemaVersion: SchemaVersion,
} as const

const request = <Tag extends string, Payload extends Schema.Top>(tag: Tag, payload: Payload) =>
  Schema.TaggedStruct(tag, { ...requestMeta, payload })

const command = <Tag extends string, Payload extends Schema.Top>(tag: Tag, payload: Payload) =>
  Schema.TaggedStruct(tag, { ...commandMeta, payload })

const projectCreatePayload = {
  projectId: ProjectId,
  name: Schema.NonEmptyString,
  workspaceRoot: WorkspaceRoot,
} as const

const projectMetaPayload = {
  projectId: ProjectId,
  name: Schema.optionalKey(Schema.NonEmptyString),
  defaultModelSelection: Schema.optionalKey(Schema.NullOr(DefaultModelSelection)),
} as const

const projectRebindPayload = {
  projectId: ProjectId,
  workspaceRoot: WorkspaceRoot,
} as const

const projectDeletePayload = {
  projectId: ProjectId,
} as const

export const ProjectCreateRequest = request("project.create", Schema.Struct(projectCreatePayload))
export const ProjectMetaUpdateRequest = request(
  "project.meta.update",
  Schema.Struct(projectMetaPayload),
)
export const ProjectRebindRequest = request("project.rebind", Schema.Struct(projectRebindPayload))
export const ProjectDeleteRequest = request("project.delete", Schema.Struct(projectDeletePayload))

export const ProjectCommandRequest = Schema.Union([
  ProjectCreateRequest,
  ProjectMetaUpdateRequest,
  ProjectRebindRequest,
  ProjectDeleteRequest,
])
export type ProjectCommandRequest = (typeof ProjectCommandRequest)["Type"]
export const decodeProjectCommandRequest = Schema.decodeUnknownEffect(ProjectCommandRequest)

export const ProjectCreate = Schema.TaggedStruct("project.create", {
  ...commandMeta,
  payload: Schema.Struct(projectCreatePayload),
  initialBoard: BoardInitialization,
})
export const ProjectMetaUpdate = command("project.meta.update", Schema.Struct(projectMetaPayload))
export const ProjectRebind = command("project.rebind", Schema.Struct(projectRebindPayload))
export const ProjectDelete = command("project.delete", Schema.Struct(projectDeletePayload))

export const ProjectCommand = Schema.Union([
  ProjectCreate,
  ProjectMetaUpdate,
  ProjectRebind,
  ProjectDelete,
])
export type ProjectCommand = (typeof ProjectCommand)["Type"]
