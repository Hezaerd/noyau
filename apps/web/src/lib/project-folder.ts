import type { ProjectId } from "@noyau/protocol/ids"
import { Effect } from "effect"

import { buildAndDispatchCommand } from "./control-plane"
import { makeProjectCreateRequest, makeProjectRebindRequest } from "./project-commands"

export const pickProjectFolderEffect = Effect.fn("pickProjectFolder")(function* () {
  return yield* Effect.promise(
    () => window.noyauDesktop?.pickFolder() ?? Promise.resolve(undefined),
  )
})

export const pickProjectFolder = () => Effect.runPromise(pickProjectFolderEffect())

export const submitProjectFolderEffect = Effect.fn("submitProjectFolder")(function* (input: {
  readonly projectId: ProjectId | undefined
  readonly workspaceRoot: string
  readonly projectName: string
}) {
  const projectId = input.projectId
  if (projectId === undefined) {
    return yield* Effect.promise(() =>
      buildAndDispatchCommand(
        makeProjectCreateRequest({
          name: input.projectName,
          workspaceRoot: input.workspaceRoot,
        }),
      ),
    )
  }
  return yield* Effect.promise(() =>
    buildAndDispatchCommand(
      makeProjectRebindRequest({
        projectId,
        workspaceRoot: input.workspaceRoot,
      }),
    ),
  )
})

export const submitProjectFolder = (input: {
  readonly projectId: ProjectId | undefined
  readonly workspaceRoot: string
  readonly projectName: string
}) => Effect.runPromise(submitProjectFolderEffect(input))
