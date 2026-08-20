import { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"

import { ThreadPage } from "@/pages/ThreadPage"

const routeId = "/projects/$projectId/thread/$threadId" as const

export const Route = createFileRoute(routeId)({
  component: ThreadRoutePage,
})

function ThreadRoutePage() {
  const { projectId: routeProjectId, threadId: routeThreadId } = useParams({ from: routeId })
  const navigate = useNavigate({ from: routeId })
  const projectId = ProjectId.make(routeProjectId)
  const threadId = routeThreadId === "new" ? undefined : ThreadId.make(routeThreadId)

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
