import { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { CommandId, ProjectId } from "@noyau/protocol/ids"
import {
  ProjectCreateRequest,
  ProjectDeleteRequest,
  ProjectRebindRequest,
} from "@noyau/protocol/project/commands"
import { Crypto, Effect, Schema } from "effect"

const uuid = Effect.fnUntraced(function* () {
  const crypto = yield* Crypto.Crypto
  return yield* crypto.randomUUIDv4
})

export const makeProjectCreateRequest = Effect.fnUntraced(function* (input: {
  readonly name: string
  readonly workspaceRoot: string
}) {
  const [commandId, projectId] = yield* Effect.all([uuid(), uuid()])
  const workspaceRoot = yield* Schema.decodeEffect(WorkspaceRoot)(input.workspaceRoot)
  return ProjectCreateRequest.make({
    commandId: CommandId.make(commandId),
    payload: {
      projectId: ProjectId.make(projectId),
      name: input.name.trim(),
      workspaceRoot,
    },
  })
})

export const makeProjectRebindRequest = Effect.fnUntraced(function* (input: {
  readonly projectId: ProjectId
  readonly workspaceRoot: string
}) {
  const workspaceRoot = yield* Schema.decodeEffect(WorkspaceRoot)(input.workspaceRoot)
  return ProjectRebindRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: {
      projectId: input.projectId,
      workspaceRoot,
    },
  })
})

export const makeProjectDeleteRequest = Effect.fnUntraced(function* (input: {
  readonly projectId: ProjectId
}) {
  return ProjectDeleteRequest.make({
    commandId: CommandId.make(yield* uuid()),
    payload: {
      projectId: input.projectId,
    },
  })
})
