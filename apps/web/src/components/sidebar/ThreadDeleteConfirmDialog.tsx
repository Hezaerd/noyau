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
          <AlertDialogTitle>Delete this Thread?</AlertDialogTitle>
          <AlertDialogDescription>
            "{threadTitle}" will be permanently removed from the Project. Transcript, Turns, and
            Session will disappear. This action cannot be undone.
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
            Delete
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
