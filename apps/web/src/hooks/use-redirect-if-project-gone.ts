import type { ProjectId } from "@noyau/protocol/ids"
import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { useControlPlane } from "@/components/control-plane-context"
import { destinationAfterProjectRemoval } from "@/lib/project-navigation"

export const useRedirectIfProjectGone = (projectId: ProjectId) => {
  const navigate = useNavigate()
  const { shell, projects } = useControlPlane()

  useEffect(() => {
    if (shell === undefined || projects.some((project) => project.id === projectId)) {
      return
    }
    const destination = destinationAfterProjectRemoval(projects)
    if (destination.to === "/") {
      void navigate({ to: "/", replace: true })
      return
    }
    void navigate({
      to: destination.to,
      params: { projectId: destination.projectId },
      replace: true,
    })
  }, [navigate, projectId, projects, shell])
}
