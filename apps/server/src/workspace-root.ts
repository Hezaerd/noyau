import type { WorkspaceRoot } from "@noyau/protocol/entities/environment"
import { Context, Effect, FileSystem, Layer } from "effect"

export interface WorkspaceRootAccessService {
  readonly isAvailable: (workspaceRoot: WorkspaceRoot) => Effect.Effect<boolean>
}

/** Frontière IO qui vérifie qu'un WorkspaceRoot est un dossier lisible et inscriptible. */
export class WorkspaceRootAccess extends Context.Service<
  WorkspaceRootAccess,
  WorkspaceRootAccessService
>()("@noyau/server/WorkspaceRootAccess") {}

export const workspaceRootAccessLayer = Layer.effect(
  WorkspaceRootAccess,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    return WorkspaceRootAccess.of({
      isAvailable: (workspaceRoot) =>
        fileSystem.stat(workspaceRoot).pipe(
          Effect.flatMap((info) =>
            info.type === "Directory"
              ? fileSystem
                  .access(workspaceRoot, { readable: true, writable: true })
                  .pipe(Effect.as(true))
              : Effect.succeed(false),
          ),
          Effect.orElseSucceed(() => false),
        ),
    })
  }),
)
