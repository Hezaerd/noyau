import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { useProjects, useSelectProject } from "@/hooks/use-control-plane"
import { useCreateDraftThread } from "@/hooks/use-create-draft-thread"
import { useRedirectIfProjectGone } from "@/hooks/use-redirect-if-project-gone"
import { ThreadPage } from "@/pages/ThreadPage"

const routeId = "/projects/$projectId/thread/$threadId" as const

export function ThreadRoutePage() {
  const { projectId: routeProjectId, threadId: routeThreadId } = useParams({ from: routeId })
  const navigate = useNavigate({ from: routeId })
  const selectProject = useSelectProject()
  const projects = useProjects()
  const createDraftThread = useCreateDraftThread()
  const projectId = ProjectId.make(routeProjectId)
  const threadId = routeThreadId === "new" ? undefined : ThreadId.make(routeThreadId)
  const project = projects.find((candidate) => candidate.id === projectId)
  const startedNewRouteKeyRef = useRef<string>(undefined)
  const newRouteKey = routeThreadId === "new" ? `${projectId}:new` : undefined
  useRedirectIfProjectGone(projectId)

  useEffect(() => {
    if (newRouteKey === undefined || project === undefined) {
      return
    }
    if (startedNewRouteKeyRef.current === newRouteKey) {
      return
    }
    startedNewRouteKeyRef.current = newRouteKey
    void createDraftThread(project, { replace: true })
  }, [createDraftThread, newRouteKey, project])

  return (
    <ThreadPage
      key={threadId ?? "new"}
      projectId={projectId}
      threadId={threadId}
      onCreated={(createdThreadId) => {
        void navigate({
          to: "/projects/$projectId/thread/$threadId",
          params: { projectId: routeProjectId, threadId: createdThreadId },
          replace: true,
        })
      }}
      onSelectProject={(nextProjectId) => {
        selectProject(nextProjectId)
        void navigate({
          to: "/projects/$projectId/thread/$threadId",
          params: { projectId: nextProjectId, threadId: "new" },
          replace: true,
        })
      }}
    />
  )
}
