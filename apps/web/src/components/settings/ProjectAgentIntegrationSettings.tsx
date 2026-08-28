import type { ProjectAgentIntegration } from "@noyau/contracts/agent-integration"
import { useEffect, useState } from "react"

import { InlineFailure } from "@/components/failure/FailureSurfaces"
import { SettingsRow } from "@/components/settings/settings-layout"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useLastProjectId, useProjects } from "@/hooks/use-control-plane"
import {
  inspectProjectAgentIntegration,
  installProjectAgentIntegration,
  removeProjectAgentIntegration,
} from "@/lib/control-plane"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"

const labels = {
  absent: "Not installed",
  current: "Up to date",
  outdated: "Update available",
  conflict: "Local changes",
  unavailable: "Unavailable",
} satisfies Record<ProjectAgentIntegration["status"], string>

const variants = {
  absent: "outline",
  current: "success",
  outdated: "warning",
  conflict: "error",
  unavailable: "warning",
} satisfies Record<ProjectAgentIntegration["status"], "outline" | "success" | "warning" | "error">

const integrationFailure = (
  failure: Parameters<typeof presentFailure>[0],
  hasUsableData: boolean,
): FailurePresentation =>
  presentFailure(failure, {
    operation: "project.agent-integration",
    scope: "action",
    initiatedByUser: true,
    hasUsableData,
  })

export function ProjectAgentIntegrationSettings() {
  const projects = useProjects()
  const lastProjectId = useLastProjectId()
  const project = projects.find((candidate) => candidate.id === lastProjectId)
  const projectId = project?.id
  const [integration, setIntegration] = useState<ProjectAgentIntegration>()
  const [loading, setLoading] = useState(false)
  const [failure, setFailure] = useState<FailurePresentation>()
  const [confirmRemove, setConfirmRemove] = useState(false)

  const inspect = () => {
    if (projectId === undefined) return
    setLoading(true)
    setFailure(undefined)
    void inspectProjectAgentIntegration({ projectId }).then((result) => {
      setLoading(false)
      if (result.ok) setIntegration(result.value)
      else setFailure(integrationFailure(result.failure, integration !== undefined))
      return undefined
    })
  }

  useEffect(() => {
    setIntegration(undefined)
    setFailure(undefined)
    if (projectId === undefined) return
    let active = true
    setLoading(true)
    void inspectProjectAgentIntegration({ projectId }).then((result) => {
      if (!active) return undefined
      setLoading(false)
      if (result.ok) setIntegration(result.value)
      else setFailure(integrationFailure(result.failure, false))
      return undefined
    })
    return () => {
      active = false
    }
  }, [projectId])

  const install = () => {
    if (projectId === undefined) return
    setLoading(true)
    setFailure(undefined)
    void installProjectAgentIntegration({ projectId }).then((result) => {
      setLoading(false)
      if (result.ok) setIntegration(result.value)
      else setFailure(integrationFailure(result.failure, integration !== undefined))
      return undefined
    })
  }

  const remove = () => {
    if (projectId === undefined) return
    setLoading(true)
    setFailure(undefined)
    void removeProjectAgentIntegration({ projectId }).then((result) => {
      setLoading(false)
      setConfirmRemove(false)
      if (result.ok) setIntegration(result.value)
      else setFailure(integrationFailure(result.failure, integration !== undefined))
      return undefined
    })
  }

  const control = (() => {
    if (project === undefined) return <Button disabled>No Project</Button>
    if (integration === undefined) {
      return (
        <Button type="button" variant="outline" loading={loading} onClick={inspect}>
          Check
        </Button>
      )
    }
    if (integration.status === "current") {
      return (
        <Button type="button" variant="outline" onClick={() => setConfirmRemove(true)}>
          Remove
        </Button>
      )
    }
    if (integration.status === "absent" || integration.status === "outdated") {
      return (
        <Button type="button" loading={loading} onClick={install}>
          {integration.status === "absent" ? "Install" : "Update"}
        </Button>
      )
    }
    return (
      <Button type="button" variant="outline" loading={loading} onClick={inspect}>
        Retry
      </Button>
    )
  })()

  return (
    <>
      <SettingsRow
        id="project-agent-integration"
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Noyau agent integration
            {integration === undefined ? null : (
              <Badge variant={variants[integration.status]}>{labels[integration.status]}</Badge>
            )}
          </span>
        }
        description={
          project === undefined
            ? "Open a Project to manage its Noyau skill."
            : `Install the skill in ${project.workspaceRoot}/.agents/skills/noyau/ so agents understand the Board and its Tickets.`
        }
        control={control}
      >
        {failure === undefined ? null : (
          <div className="mt-3">
            <InlineFailure presentation={failure} />
          </div>
        )}
      </SettingsRow>
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the Noyau skill?</AlertDialogTitle>
            <AlertDialogDescription>
              Agents in "{project?.name ?? "this Project"}" will no longer receive instructions to
              use the Board. Noyau only removes the files it manages that have not been modified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </AlertDialogClose>
            <Button type="button" variant="destructive" loading={loading} onClick={remove}>
              Remove the skill
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}
