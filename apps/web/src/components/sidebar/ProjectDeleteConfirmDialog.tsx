import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

interface ProjectDeleteConfirmDialogProps {
  readonly open: boolean
  readonly projectName: string
  readonly threadCount: number
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
}

export function ProjectDeleteConfirmDialog({
  open,
  projectName,
  threadCount,
  onOpenChange,
  onConfirm,
}: ProjectDeleteConfirmDialogProps) {
  const threads =
    threadCount === 0
      ? null
      : threadCount === 1
        ? " Son Thread disparaîtra du control plane."
        : ` Ses ${String(threadCount)} Threads disparaîtront du control plane.`

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer le Project ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {projectName} » quittera Noyau. Son Tableau est retiré.{threads} Le dossier sur le
            disque n’est pas modifié.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button type="button" variant="ghost" />}>
            Annuler
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button type="button" variant="destructive" />}
            onClick={onConfirm}
          >
            Retirer
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
