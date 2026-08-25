import type { ProjectId } from "@noyau/protocol/ids"
import { useState } from "react"

import { InlineFailure } from "@/components/failure/FailureSurfaces"
import { ProjectAgentIntegrationSetup } from "@/components/ProjectAgentIntegrationSetup"
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
import { useProjects } from "@/hooks/use-control-plane"
import { useProjectFolderStartDirectory } from "@/hooks/use-project-folder-start-directory"
import { invalidInputFailure } from "@/lib/app-failure"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"
import { pickProjectFolder, submitProjectFolder } from "@/lib/project-folder"

interface ProjectFolderDialogProps {
  readonly open: boolean
  readonly projectId: ProjectId | undefined
  readonly onOpenChange: (open: boolean) => void
  readonly onProjectCreated?: (projectId: ProjectId) => void
}

const folderName = (path: string): string =>
  path
    .replace(/[\\/]+$/u, "")
    .split(/[\\/]/u)
    .pop() ?? path

export function ProjectFolderDialog({
  open,
  projectId,
  onOpenChange,
  onProjectCreated,
}: ProjectFolderDialogProps) {
  const projects = useProjects()
  const projectFolderStartDirectory = useProjectFolderStartDirectory()
  const project = projects.find((candidate) => candidate.id === projectId)
  const [workspaceRoot, setWorkspaceRoot] = useState("")
  const [name, setName] = useState("")
  const [failure, setFailure] = useState<FailurePresentation>()
  const [submitting, setSubmitting] = useState(false)
  const [createdProjectId, setCreatedProjectId] = useState<ProjectId>()

  const finishCreation = () => {
    const created = createdProjectId
    setCreatedProjectId(undefined)
    setWorkspaceRoot("")
    setName("")
    setFailure(undefined)
    onOpenChange(false)
    if (created !== undefined) {
      onProjectCreated?.(created)
    }
  }

  const chooseFolder = () => {
    void pickProjectFolder(projectId === undefined ? projectFolderStartDirectory : undefined).then(
      (result) => {
        if (!result.ok) {
          setFailure(
            presentFailure(result.failure, {
              operation: "project.folder.pick",
              scope: "action",
              initiatedByUser: true,
              hasUsableData: true,
            }),
          )
          return undefined
        }
        if (result.value === undefined) {
          return undefined
        }
        setWorkspaceRoot(result.value)
        setFailure(undefined)
        if (name.trim() === "") {
          setName(folderName(result.value))
        }
        return undefined
      },
    )
  }

  const submit = () => {
    const path = workspaceRoot.trim()
    const projectName = (name.trim() || folderName(path)).trim()
    if (path === "" || projectName === "") {
      setFailure(
        presentFailure(invalidInputFailure("Choisis un dossier existant et donne-lui un nom."), {
          operation: "project.folder.submit",
          scope: "field",
          initiatedByUser: true,
          hasUsableData: true,
        }),
      )
      return
    }
    setSubmitting(true)
    void submitProjectFolder({ projectId, workspaceRoot: path, projectName }).then((result) => {
      setSubmitting(false)
      if (!result.ok) {
        setFailure(
          presentFailure(result.failure, {
            operation: "project.folder.submit",
            scope: "action",
            initiatedByUser: true,
            hasUsableData: true,
          }),
        )
        return undefined
      }
      if (result.value !== undefined) {
        setCreatedProjectId(result.value)
      } else {
        setWorkspaceRoot("")
        setName("")
        setFailure(undefined)
        onOpenChange(false)
      }
      return undefined
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (createdProjectId !== undefined) {
            finishCreation()
            return
          }
          setFailure(undefined)
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {createdProjectId !== undefined
              ? "Configurer les agents"
              : project === undefined
                ? "Relier un dossier"
                : "Relier le dossier"}
          </DialogTitle>
          <DialogDescription>
            {createdProjectId === undefined
              ? "Noyau travaille directement dans un dossier déjà présent sur cette machine."
              : "Le Project est relié. Tu peux maintenant installer son intégration agent recommandée."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-4">
          {createdProjectId !== undefined ? (
            <ProjectAgentIntegrationSetup projectId={createdProjectId} onDone={finishCreation} />
          ) : (
            <>
              {project === undefined ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="project-name">Nom du Project</Label>
                  <Input
                    id="project-name"
                    aria-describedby={failure === undefined ? undefined : "project-folder-error"}
                    aria-invalid={failure === undefined ? undefined : true}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setFailure(undefined)
                    }}
                    placeholder="Mon Project"
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="workspace-root">Dossier existant</Label>
                <div className="flex gap-2">
                  <Input
                    id="workspace-root"
                    aria-describedby={failure === undefined ? undefined : "project-folder-error"}
                    aria-invalid={failure === undefined ? undefined : true}
                    value={workspaceRoot}
                    onChange={(event) => {
                      setWorkspaceRoot(event.target.value)
                      setFailure(undefined)
                    }}
                    placeholder="/Users/moi/Projet"
                  />
                  <Button type="button" variant="outline" onClick={() => chooseFolder()}>
                    Parcourir
                  </Button>
                </div>
              </div>
              {failure === undefined ? null : (
                <InlineFailure id="project-folder-error" presentation={failure} />
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Annuler
                </Button>
                <Button type="button" disabled={submitting} onClick={() => submit()}>
                  {project === undefined ? "Relier le dossier" : "Rebind le dossier"}
                </Button>
              </div>
            </>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
