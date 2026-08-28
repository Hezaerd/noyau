import type { ProjectId } from "@noyau/contracts/ids"
import { CheckCircle2Icon, SparklesIcon } from "lucide-react"
import { useState } from "react"

import { InlineFailure } from "@/components/failure/FailureSurfaces"
import { Button } from "@/components/ui/button"
import { installProjectAgentIntegration } from "@/lib/control-plane"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"

export function ProjectAgentIntegrationSetup({
  projectId,
  onDone,
}: {
  readonly projectId: ProjectId
  readonly onDone: () => void
}) {
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [failure, setFailure] = useState<FailurePresentation>()

  const install = () => {
    setInstalling(true)
    setFailure(undefined)
    void installProjectAgentIntegration({ projectId }).then((result) => {
      setInstalling(false)
      if (!result.ok) {
        setFailure(
          presentFailure(result.failure, {
            operation: "project.agent-integration",
            scope: "action",
            initiatedByUser: true,
            hasUsableData: true,
          }),
        )
        return undefined
      }
      setInstalled(true)
      return undefined
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-muted/35 p-4">
        <div className="flex items-start gap-3">
          {installed ? (
            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          ) : (
            <SparklesIcon className="mt-0.5 size-5 shrink-0 text-primary" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {installed ? "Agent integration installed" : "Make agents more effective"}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
              {installed
                ? "Agents in this Project now know how to use its Board and Tickets."
                : "Install the Noyau skill so agents can read the Board, pick an actionable Ticket, and honor its dependencies."}
            </p>
            <code className="mt-2 block break-all text-[11px] text-muted-foreground">
              .agents/skills/noyau/
            </code>
          </div>
        </div>
      </div>
      {failure === undefined ? null : <InlineFailure presentation={failure} />}
      <div className="flex justify-end gap-2">
        {installed ? null : (
          <Button type="button" variant="ghost" onClick={onDone}>
            Later
          </Button>
        )}
        {installed ? (
          <Button type="button" onClick={onDone}>
            Finish
          </Button>
        ) : (
          <Button type="button" loading={installing} onClick={install}>
            Install the Noyau skill
          </Button>
        )}
      </div>
    </div>
  )
}
