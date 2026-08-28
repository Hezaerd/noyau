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
          <AlertDialogTitle>Archive this ticket?</AlertDialogTitle>
          <AlertDialogDescription>
            "{ticketTitle}" will leave the Board. Its content, dependencies, and history remain
            available.
            {blockedBy === ""
              ? null
              : ` It is still blocked by ${blockedBy}. Archiving confirms you want to continue despite these open dependencies.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button type="button" variant="ghost" />}>
            Cancel
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button type="button" variant="destructive" />}
            onClick={onConfirm}
          >
            Archive
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
