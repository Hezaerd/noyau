import type { CursorModel, Provider } from "@noyau/contracts/entities/environment"
import type { ProjectShell } from "@noyau/contracts/shell"
import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"

import { useClaude, useCodex, useCursor, useSelectProject } from "@/hooks/use-control-plane"
import { createDraftThread, createDraftThreadForNewRoute } from "@/lib/create-draft-thread"
import { isCursorReady } from "@/lib/cursor-readiness"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import { resolveDraftDefaultModelSelection } from "@/lib/model-picker-preferences"

const providersOf = (input: {
  readonly cursorReady: boolean
  readonly claudeReady: boolean
  readonly codexReady: boolean
}): ReadonlyArray<Provider> => [
  ...(input.cursorReady ? (["cursor"] as const) : []),
  ...(input.claudeReady ? (["claude"] as const) : []),
  ...(input.codexReady ? (["codex"] as const) : []),
]

export const useCreateDraftThread = () => {
  const navigate = useNavigate()
  const selectProject = useSelectProject()
  const cursor = useCursor()
  const claude = useClaude()
  const codex = useCodex()
  const cursorReady = isCursorReady(cursor)
  const claudeReady = isCursorReady(claude)
  const codexReady = isCursorReady(codex)

  return useCallback(
    (
      project: Pick<ProjectShell, "id" | "defaultModelSelection">,
      options?: { readonly replace?: boolean; readonly signal?: AbortSignal },
    ) => {
      const availableProviders = providersOf({ cursorReady, claudeReady, codexReady })
      const modelsByProvider = {
        cursor: cursor?.models ?? [],
        claude: claude?.models ?? [],
        codex: codex?.models ?? [],
      } satisfies Readonly<Record<Provider, ReadonlyArray<CursorModel>>>
      const resolved = resolveDraftDefaultModelSelection({
        stored: project.defaultModelSelection,
        availableProviders,
        modelsByProvider,
      })
      const create = options?.replace === true ? createDraftThreadForNewRoute : createDraftThread
      selectProject(project.id)
      return create(
        Object.assign(
          { projectId: project.id },
          resolved === null
            ? {}
            : { provider: resolved.provider, modelSelection: resolved.modelSelection },
        ),
      ).then((result) => {
        if (!result.ok) {
          showFailureToast(
            presentFailure(result.failure, {
              operation: "thread.create",
              scope: "project",
              initiatedByUser: true,
              hasUsableData: true,
            }),
          )
          return undefined
        }
        if (options?.signal?.aborted) {
          return undefined
        }
        return navigate({
          to: "/projects/$projectId/thread/$threadId",
          params: { projectId: project.id, threadId: result.threadId },
          replace: options?.replace === true,
        })
      })
    },
    [claude, claudeReady, codex, codexReady, cursor, cursorReady, navigate, selectProject],
  )
}
