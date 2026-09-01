import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { useNavigate, useParams, useSearch } from "@tanstack/react-router"

import { useSelectProject } from "@/hooks/use-control-plane"
import { useRedirectIfProjectGone } from "@/hooks/use-redirect-if-project-gone"
import { makeNewThreadDraftId } from "@/lib/composer-drafts"
import { buildCommand } from "@/lib/control-plane"
import { ThreadPage } from "@/pages/ThreadPage"

const routeId = "/projects/$projectId/thread/$threadId" as const

export function ThreadRoutePage() {
  const { projectId: routeProjectId, threadId: routeThreadId } = useParams({ from: routeId })
  const { draft: draftId } = useSearch({ from: routeId })
  const navigate = useNavigate({ from: routeId })
  const selectProject = useSelectProject()
  const projectId = ProjectId.make(routeProjectId)
  const threadId = routeThreadId === "new" ? undefined : ThreadId.make(routeThreadId)
  useRedirectIfProjectGone(projectId)

  return (
    <ThreadPage
      key={`${projectId}:${threadId ?? `new:${draftId ?? "legacy"}`}`}
      projectId={projectId}
      threadId={threadId}
      draftId={threadId === undefined ? draftId : undefined}
      onCreated={(createdThreadId) => {
        void navigate({
          to: "/projects/$projectId/thread/$threadId",
          params: { projectId: routeProjectId, threadId: createdThreadId },
          search: {},
          replace: true,
        })
      }}
      onSelectProject={(nextProjectId) => {
        selectProject(nextProjectId)
        void buildCommand(makeNewThreadDraftId()).then((nextDraftId) => {
          if (!nextDraftId.ok) {
            return undefined
          }
          return navigate({
            to: "/projects/$projectId/thread/$threadId",
            params: { projectId: nextProjectId, threadId: "new" },
            search: { draft: nextDraftId.value },
            replace: true,
          })
        })
      }}
    />
  )
}
