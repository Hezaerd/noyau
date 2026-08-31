import { useNavigate } from "@tanstack/react-router"
import { useLayoutEffect, useState } from "react"

import { ResourceErrorState } from "@/components/failure/FailureSurfaces"
import { ProjectFolderDialog } from "@/components/ProjectFolderDialog"
import { Button } from "@/components/ui/button"
import {
  useAppliedShell,
  useLastScreen,
  useProjects,
  useSelectProject,
  useSubscriptionStatus,
  useThreads,
} from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { presentFailure } from "@/lib/failure-presentation"
import { resolveStartupDestination, startupNavigateTarget } from "@/lib/last-screen"

export function HomePage() {
  const navigate = useNavigate()
  const shell = useAppliedShell()
  const lastScreen = useLastScreen()
  const projects = useProjects()
  const threads = useThreads()
  const selectProject = useSelectProject()
  const subscriptionStatus = useSubscriptionStatus()
  const failure = useDelayedSubscriptionFailure(subscriptionStatus)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const destination =
    shell === undefined ? undefined : resolveStartupDestination(lastScreen, projects, threads)

  useLayoutEffect(() => {
    if (destination === undefined || destination._tag === "home" || linkDialogOpen) {
      return
    }
    void navigate({
      replace: true,
      ...startupNavigateTarget(destination),
    })
  }, [destination, linkDialogOpen, navigate])

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
    return null
  }

  if (destination !== undefined && destination._tag !== "home") {
    return null
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
