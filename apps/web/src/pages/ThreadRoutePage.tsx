import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { useNavigate, useParams } from "@tanstack/react-router"

import { useRedirectIfProjectGone } from "@/hooks/use-redirect-if-project-gone"
import { ThreadPage } from "@/pages/ThreadPage"

const routeId = "/projects/$projectId/thread/$threadId" as const

export function ThreadRoutePage() {
  const { projectId: routeProjectId, threadId: routeThreadId } = useParams({ from: routeId })
  const navigate = useNavigate({ from: routeId })
  const projectId = ProjectId.make(routeProjectId)
  const threadId = routeThreadId === "new" ? undefined : ThreadId.make(routeThreadId)
  useRedirectIfProjectGone(projectId)

  return (
    <ThreadPage
      projectId={projectId}
      threadId={threadId}
      onCreated={(createdThreadId) => {
        void navigate({
          to: "/projects/$projectId/thread/$threadId",
          params: { projectId: routeProjectId, threadId: createdThreadId },
          replace: true,
        })
      }}
    />
  )
}
