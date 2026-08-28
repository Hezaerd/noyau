import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { ResourceErrorState } from "@/components/failure/FailureSurfaces"
import { ProjectFolderDialog } from "@/components/ProjectFolderDialog"
import { Button } from "@/components/ui/button"
import {
  useAppliedShell,
  useLastProjectId,
  useProjects,
  useSelectProject,
  useSubscriptionStatus,
} from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { presentFailure } from "@/lib/failure-presentation"

export function HomePage() {
  const navigate = useNavigate()
  const shell = useAppliedShell()
  const lastProjectId = useLastProjectId()
  const projects = useProjects()
  const selectProject = useSelectProject()
  const subscriptionStatus = useSubscriptionStatus()
  const failure = useDelayedSubscriptionFailure(subscriptionStatus)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  useEffect(() => {
    if (shell === undefined || lastProjectId === undefined || linkDialogOpen) {
      return
    }
    if (!projects.some((project) => project.id === lastProjectId)) {
      return
    }
    void navigate({
      replace: true,
      to: "/projects/$projectId/board",
      params: { projectId: lastProjectId },
    })
  }, [lastProjectId, linkDialogOpen, navigate, projects, shell])

  if (shell === undefined) {
    if (failure !== undefined) {
      return (
        <ResourceErrorState
          presentation={presentFailure(failure, {
            operation: "shell.subscribe",
            scope: "shell",
            initiatedByUser: false,
            hasUsableData: false,
          })}
          onRecovery={() => window.location.reload()}
        />
      )
    }
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Connecting to the control plane…
      </main>
    )
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium text-primary">Noyau</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">What are we working on?</h2>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          Link an existing folder to open its Board. Projects and their Threads stay durable in the
          control plane.
        </p>
        <Button className="mt-8" onClick={() => setLinkDialogOpen(true)}>
          Link a folder
        </Button>
      </main>
      <ProjectFolderDialog
        open={linkDialogOpen}
        projectId={undefined}
        onProjectCreated={selectProject}
        onOpenChange={setLinkDialogOpen}
      />
    </>
  )
}
