import type { ProjectId } from "@noyau/protocol/ids"
import { useState } from "react"

import { useControlPlane } from "@/components/control-plane-context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { makeProjectCreateRequest, makeProjectRebindRequest } from "@/lib/project-commands"

interface ProjectFolderDialogProps {
  readonly open: boolean
  readonly projectId?: ProjectId
  readonly onOpenChange: (open: boolean) => void
}

const folderName = (path: string): string =>
  path
    .replace(/[\\/]+$/u, "")
    .split(/[\\/]/u)
    .pop() ?? path

export function ProjectFolderDialog({ open, projectId, onOpenChange }: ProjectFolderDialogProps) {
  const { projects } = useControlPlane()
  const project = projects.find((candidate) => candidate.id === projectId)
  const [workspaceRoot, setWorkspaceRoot] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  const chooseFolder = async () => {
    const path = await window.noyauDesktop?.pickFolder()
    if (path === undefined) {
      return
    }
    setWorkspaceRoot(path)
    if (name.trim() === "") {
      setName(folderName(path))
    }
  }

  const submit = async () => {
    const path = workspaceRoot.trim()
    const projectName = (name.trim() || folderName(path)).trim()
    if (path === "" || projectName === "") {
      setError("Choisis un dossier existant et donne-lui un nom.")
      return
    }
    setSubmitting(true)
    const result = projectId
      ? await buildAndDispatchCommand(makeProjectRebindRequest({ projectId, workspaceRoot: path }))
      : await buildAndDispatchCommand(
          makeProjectCreateRequest({ name: projectName, workspaceRoot: path }),
        )
    setSubmitting(false)
    if (!result.ok) {
      setError(result.details)
      return
    }
    setWorkspaceRoot("")
    setName("")
    setError(undefined)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setError(undefined)
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {project === undefined ? "Relier un dossier" : "Relier le dossier"}
          </DialogTitle>
          <DialogDescription>
            Noyau travaille directement dans un dossier déjà présent sur cette machine.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-4">
          {project === undefined ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-name">Nom du Project</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Mon Project"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="workspace-root">Dossier existant</Label>
            <div className="flex gap-2">
              <Input
                id="workspace-root"
                value={workspaceRoot}
                onChange={(event) => setWorkspaceRoot(event.target.value)}
                placeholder="/Users/moi/Projet"
              />
              <Button type="button" variant="outline" onClick={() => void chooseFolder()}>
                Parcourir
              </Button>
            </div>
          </div>
          {error === undefined ? null : (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void submit()}>
              {project === undefined ? "Relier le dossier" : "Rebind le dossier"}
            </Button>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
