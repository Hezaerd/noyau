import type { ProjectShell } from "@noyau/contracts/shell"
import { Link } from "@tanstack/react-router"
import { FolderIcon, Trash2Icon } from "lucide-react"
import { memo, useState } from "react"

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
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { clearDraftCheckout } from "@/lib/checkout"
import type { NewThreadDraftId } from "@/lib/composer-drafts"
import { clearDraftComposerPreferences } from "@/lib/draft-composer-preferences"
import { clearComposerDraft } from "@/state/composer-drafts"

export const DraftThreadSidebarItem = memo(function DraftThreadSidebarItem({
  project,
  draftId,
  title,
  isActive,
  onSelect,
}: {
  readonly project: Pick<ProjectShell, "id" | "name">
  readonly draftId?: NewThreadDraftId | undefined
  readonly title: string
  readonly isActive: boolean
  readonly onSelect: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  return (
    <>
      <ContextMenu onOpenChange={setMenuOpen}>
        <ContextMenuTrigger render={<div />}>
          <SidebarMenuButton
            render={
              <Link
                to="/projects/$projectId/thread/$threadId"
                params={{ projectId: project.id, threadId: "new" }}
                search={draftId === undefined ? {} : { draft: draftId }}
                onClick={onSelect}
              />
            }
            isActive={isActive}
            aria-label={title}
            {...(menuOpen ? {} : { tooltip: title })}
            className="group/thread-item h-auto min-h-16 items-start py-2 font-normal text-sidebar-foreground/58 data-[active=true]:font-normal [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-normal"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                data-slot="thread-sidebar-activity"
                className="flex min-h-4 min-w-0 items-center gap-1.5"
              >
                <span
                  data-slot="thread-sidebar-project"
                  className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-sidebar-foreground/45"
                >
                  <FolderIcon aria-hidden className="size-3 shrink-0 opacity-70" />
                  <span className="min-w-0 truncate">{project.name}</span>
                </span>
                <span
                  data-slot="thread-sidebar-draft"
                  className="ml-auto shrink-0 font-medium text-[11px] text-sidebar-foreground/45"
                >
                  Draft
                </span>
              </span>
              <span
                data-slot="thread-sidebar-title"
                className="min-w-0 truncate font-normal group-data-[active=true]/thread-item:text-sidebar-accent-foreground"
              >
                {title}
              </span>
            </span>
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuPopup align="start" className="w-44">
          <ContextMenuItem
            closeOnClick
            variant="destructive"
            onClick={() => requestAnimationFrame(() => setDeleteConfirmOpen(true))}
          >
            <Trash2Icon />
            Discard
          </ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              "{title}" will be removed from the sidebar. The unsent message is discarded and cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button type="button" variant="destructive" />}
              onClick={() => {
                clearComposerDraft(project.id, undefined, draftId)
                clearDraftComposerPreferences(project.id, undefined, draftId)
                clearDraftCheckout(project.id, draftId)
              }}
            >
              Discard
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
})
