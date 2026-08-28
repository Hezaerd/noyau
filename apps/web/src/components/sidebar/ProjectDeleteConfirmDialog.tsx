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
        ? " Its Thread will disappear from the control plane."
        : ` Its ${String(threadCount)} Threads will disappear from the control plane.`

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this Project?</AlertDialogTitle>
          <AlertDialogDescription>
            "{projectName}" will leave Noyau. Its Board is removed.{threads} The folder on disk is
            not modified.
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
            Remove
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  )
}
