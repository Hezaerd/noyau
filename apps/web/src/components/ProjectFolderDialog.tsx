import type { ProjectId } from "@noyau/protocol/ids"
import { useState } from "react"

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
import { useControlPlane } from "@/hooks/use-control-plane"
import { pickProjectFolder, submitProjectFolder } from "@/lib/project-folder"

interface ProjectFolderDialogProps {
  readonly open: boolean
  readonly projectId: ProjectId | undefined
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

  const chooseFolder = () => {
    void pickProjectFolder().then((path) => {
      if (path === undefined) {
        return undefined
      }
      setWorkspaceRoot(path)
      if (name.trim() === "") {
        setName(folderName(path))
      }
      return undefined
    })
  }

  const submit = () => {
    const path = workspaceRoot.trim()
    const projectName = (name.trim() || folderName(path)).trim()
    if (path === "" || projectName === "") {
      setError("Choisis un dossier existant et donne-lui un nom.")
      return
    }
    setSubmitting(true)
    void submitProjectFolder({ projectId, workspaceRoot: path, projectName }).then((result) => {
      setSubmitting(false)
      if (!result.ok) {
        setError(result.details)
        return undefined
      }
      setWorkspaceRoot("")
      setName("")
      setError(undefined)
      onOpenChange(false)
      return undefined
    })
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
              <Button type="button" variant="outline" onClick={() => chooseFolder()}>
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
            <Button type="button" disabled={submitting} onClick={() => submit()}>
              {project === undefined ? "Relier le dossier" : "Rebind le dossier"}
            </Button>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
