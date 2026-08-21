import type { ProjectId } from "@noyau/protocol/ids"
import { Effect } from "effect"

import {
  buildAndDispatchCommand,
  buildCommand,
  dispatchCommand,
  type ControlPlaneResult,
} from "./control-plane"
import { makeProjectCreateRequest, makeProjectRebindRequest } from "./project-commands"

export const pickProjectFolderEffect = Effect.fn("pickProjectFolder")(function* (
  initialPath: string | undefined,
) {
  return yield* Effect.promise(
    () =>
      window.noyauDesktop?.pickFolder(initialPath === undefined ? undefined : { initialPath }) ??
      Promise.resolve(undefined),
  )
})

export const pickProjectFolder = (initialPath: string | undefined) =>
  Effect.runPromise(pickProjectFolderEffect(initialPath))

export const submitProjectFolderEffect = Effect.fn("submitProjectFolder")(function* (input: {
  readonly projectId: ProjectId | undefined
  readonly workspaceRoot: string
  readonly projectName: string
}) {
  const projectId = input.projectId
  if (projectId === undefined) {
    const built = yield* Effect.promise(() =>
      buildCommand(
        makeProjectCreateRequest({
          name: input.projectName,
          workspaceRoot: input.workspaceRoot,
        }),
      ),
    )
    if (!built.ok) {
      return built
    }
    const result = yield* Effect.promise(() => dispatchCommand(built.value))
    if (!result.ok) {
      return result
    }
    return { ok: true as const, value: built.value.payload.projectId }
  }
  const result = yield* Effect.promise(() =>
    buildAndDispatchCommand(
      makeProjectRebindRequest({
        projectId,
        workspaceRoot: input.workspaceRoot,
      }),
    ),
  )
  if (!result.ok) {
    return result
  }
  return { ok: true as const, value: undefined }
})

export const submitProjectFolder = (input: {
  readonly projectId: ProjectId | undefined
  readonly workspaceRoot: string
  readonly projectName: string
}): Promise<ControlPlaneResult<ProjectId | undefined>> =>
  Effect.runPromise(submitProjectFolderEffect(input))
