import type { ProjectId } from "@noyau/contracts/ids"
import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"

import { useSelectProject } from "@/hooks/use-control-plane"

export const useCreateDraftThread = () => {
  const navigate = useNavigate()
  const selectProject = useSelectProject()

  return useCallback(
    (project: { readonly id: ProjectId }) => {
      selectProject(project.id)
      return navigate({
        to: "/projects/$projectId/thread/$threadId",
        params: { projectId: project.id, threadId: "new" },
      })
    },
    [navigate, selectProject],
  )
}
