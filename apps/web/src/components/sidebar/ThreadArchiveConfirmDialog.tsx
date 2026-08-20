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

interface ThreadArchiveConfirmDialogProps {
  readonly open: boolean
  readonly threadTitle: string
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
}

export function ThreadArchiveConfirmDialog({
  open,
  threadTitle,
  onOpenChange,
  onConfirm,
}: ThreadArchiveConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Archiver le Thread ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {threadTitle} » quittera la sidebar du Project. Son transcript reste disponible.
            Restaure-le avant un nouveau Turn.
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
            Archiver
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
