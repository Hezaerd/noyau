import type { ProjectId } from "@noyau/contracts/ids"
import { Effect, Schema } from "effect"

import { invalidInputFailure } from "./app-failure"
import {
  buildAndDispatchCommand,
  buildCommand,
  dispatchCommand,
  type ControlPlaneResult,
} from "./control-plane"
import { makeProjectCreateRequest, makeProjectRebindRequest } from "./project-commands"

class DesktopFolderPickerUnavailable extends Schema.TaggedError<DesktopFolderPickerUnavailable>()(
  "DesktopFolderPickerUnavailable",
  {
    message: Schema.String,
  },
) {}

class DesktopFolderPickerFailed extends Schema.TaggedError<DesktopFolderPickerFailed>()(
  "DesktopFolderPickerFailed",
  {
    message: Schema.String,
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

const folderPickerOptions = (initialPath: string | undefined) => {
  const trimmed = initialPath?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : { initialPath: trimmed }
}

export const pickProjectFolderEffect = Effect.fn("pickProjectFolder")(function* (
  initialPath: string | undefined,
) {
  const pickFolder = globalThis.window?.noyauDesktop?.pickFolder
  if (pickFolder === undefined) {
    return yield* new DesktopFolderPickerUnavailable({
      message: "Le sélecteur de dossier n’est disponible que dans Noyau Desktop.",
    })
  }

  return yield* Effect.tryPromise({
    try: () => pickFolder(folderPickerOptions(initialPath)),
    catch: (cause) =>
      new DesktopFolderPickerFailed({
        message: "Impossible d’ouvrir le sélecteur de dossier.",
        cause,
      }),
  })
})

export const pickProjectFolder = (
  initialPath: string | undefined,
): Promise<ControlPlaneResult<string | undefined>> =>
  Effect.runPromise(
    pickProjectFolderEffect(initialPath).pipe(
      Effect.match({
        onFailure: (error) => ({
          ok: false as const,
          failure: invalidInputFailure(error.message),
        }),
        onSuccess: (value) => ({ ok: true as const, value }),
      }),
    ),
  )

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
