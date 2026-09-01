import type { ProjectId } from "@noyau/contracts/ids"
import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"

import { useSelectProject } from "@/hooks/use-control-plane"
import { makeNewThreadDraftId } from "@/lib/composer-drafts"
import { buildCommand } from "@/lib/control-plane"

export const useCreateDraftThread = () => {
  const navigate = useNavigate()
  const selectProject = useSelectProject()

  return useCallback(
    async (project: { readonly id: ProjectId }) => {
      selectProject(project.id)
      const draftId = await buildCommand(makeNewThreadDraftId())
      if (!draftId.ok) {
        return
      }
      return navigate({
        to: "/projects/$projectId/thread/$threadId",
        params: { projectId: project.id, threadId: "new" },
        search: { draft: draftId.value },
      })
    },
    [navigate, selectProject],
  )
}
