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
import { formatQuotedList } from "@/lib/quoted-list"

interface TicketArchiveConfirmDialogProps {
  readonly open: boolean
  readonly ticketTitle: string
  readonly blockedByTitles: ReadonlyArray<string>
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
}

export function TicketArchiveConfirmDialog({
  open,
  ticketTitle,
  blockedByTitles,
  onOpenChange,
  onConfirm,
}: TicketArchiveConfirmDialogProps) {
  const blockedBy = formatQuotedList(blockedByTitles)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Archiver le ticket ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {ticketTitle} » quittera le Tableau. Son contenu, ses dépendances et son historique
            restent disponibles.
            {blockedBy === ""
              ? null
              : ` Il est encore bloqué par ${blockedBy}. L’archivage confirme que tu poursuis malgré ces dépendances ouvertes.`}
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
