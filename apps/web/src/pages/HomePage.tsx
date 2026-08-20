import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"

import { ProjectFolderDialog } from "@/components/ProjectFolderDialog"
import { Button } from "@/components/ui/button"
import { useControlPlane } from "@/hooks/use-control-plane"

export function HomePage() {
  const navigate = useNavigate()
  const { shell, lastProjectId } = useControlPlane()
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  useEffect(() => {
    if (lastProjectId !== undefined) {
      void navigate({
        replace: true,
        to: "/projects/$projectId/board",
        params: { projectId: lastProjectId },
      })
    }
  }, [lastProjectId, navigate])

  if (shell === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Connexion au control plane…
      </main>
    )
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-medium text-primary">Noyau</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Sur quoi on travaille ?</h2>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          Relie un dossier existant pour ouvrir son Tableau. Les Projects et leurs Threads restent
          durables dans le control plane.
        </p>
        <Button className="mt-8" onClick={() => setLinkDialogOpen(true)}>
          Enregistrer un dossier
        </Button>
      </main>
      <ProjectFolderDialog
        open={linkDialogOpen}
        projectId={undefined}
        onOpenChange={setLinkDialogOpen}
      />
    </>
  )
}
