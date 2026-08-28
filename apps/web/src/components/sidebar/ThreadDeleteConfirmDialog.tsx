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

interface ThreadDeleteConfirmDialogProps {
  readonly open: boolean
  readonly threadTitle: string
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
}

export function ThreadDeleteConfirmDialog({
  open,
  threadTitle,
  onOpenChange,
  onConfirm,
}: ThreadDeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer le Thread ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {threadTitle} » sera définitivement retiré du Project. Transcript, Turns et Session
            disparaissent. Cette action est irréversible.
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
            Supprimer
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
