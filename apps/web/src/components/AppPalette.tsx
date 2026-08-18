import { useNavigate, useRouterState } from "@tanstack/react-router"
import { InboxIcon, LayoutGridIcon, MessageCircleIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react"

import {
  AppPaletteContext,
  type AppPaletteAction,
  type AppPaletteContextValue,
} from "@/components/app-palette-context"
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandDialogPrimitive,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "@/components/ui/command"
import {
  buildPaletteGroups,
  parseRecentActionIds,
  serializeRecentActionIds,
  updateRecentActionIds,
} from "@/lib/app-palette"

const RECENT_ACTIONS_STORAGE_KEY = "noyau.palette.recent-actions"

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false
  }
  return target.closest("input, textarea, select, [contenteditable=true]") !== null
}

const readRecentActionIds = (): ReadonlyArray<string> => {
  try {
    return parseRecentActionIds(window.localStorage.getItem(RECENT_ACTIONS_STORAGE_KEY))
  } catch {
    return []
  }
}

export function AppPaletteProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [open, setOpen] = useState(false)
  const [pageActions, setPageActions] = useState<ReadonlyArray<AppPaletteAction>>([])
  const [recentActionIds, setRecentActionIds] = useState<ReadonlyArray<string>>(readRecentActionIds)

  const registerPageActions = useCallback((actions: ReadonlyArray<AppPaletteAction>) => {
    setPageActions(actions)
    return () => {
      setPageActions((current) => (current === actions ? [] : current))
    }
  }, [])
  const context = useMemo<AppPaletteContextValue>(
    () => ({ registerPageActions }),
    [registerPageActions],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(
        RECENT_ACTIONS_STORAGE_KEY,
        serializeRecentActionIds(recentActionIds),
      )
    } catch {
      // Local preferences remain optional when storage is unavailable.
    }
  }, [recentActionIds])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey) ||
        isEditableTarget(event.target) ||
        (!open && document.querySelector('[role="dialog"]') !== null)
      ) {
        return
      }
      event.preventDefault()
      setOpen(true)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open])

  const navigationActions = useMemo<ReadonlyArray<AppPaletteAction>>(() => {
    const actions: Array<AppPaletteAction & { readonly path: string }> = [
      {
        id: "navigate.inbox",
        label: "Inbox",
        searchValue: "Aller à l’Inbox",
        path: "/",
        icon: <InboxIcon />,
        execute: () => navigate({ to: "/" }),
      },
      {
        id: "navigate.board",
        label: "Tableau",
        searchValue: "Aller au Tableau",
        path: "/projects/noyau/board",
        icon: <LayoutGridIcon />,
        execute: () =>
          navigate({
            to: "/projects/$projectId/board",
            params: { projectId: "noyau" },
          }),
      },
      {
        id: "navigate.channel",
        label: "Canal",
        searchValue: "Aller au Canal",
        path: "/projects/noyau/channel",
        icon: <MessageCircleIcon />,
        execute: () => navigate({ to: "/projects/noyau/channel" }),
      },
    ]
    return actions.filter((action) => action.path !== pathname)
  }, [navigate, pathname])

  const groups = useMemo(
    () => buildPaletteGroups(pageActions, navigationActions, recentActionIds),
    [navigationActions, pageActions, recentActionIds],
  )

  const executeAction = (action: AppPaletteAction): void => {
    setOpen(false)
    setRecentActionIds((current) => updateRecentActionIds(current, action.id))
    void action.execute()
  }

  return (
    <AppPaletteContext.Provider value={context}>
      <CommandDialog open={open} onOpenChange={setOpen}>
        {children}
        <CommandDialogPopup>
          <CommandDialogPrimitive.Title className="sr-only">Palette</CommandDialogPrimitive.Title>
          <CommandPanel>
            <Command items={groups}>
              <CommandInput placeholder="Rechercher une action ou une page…" />
              <CommandEmpty>Aucun résultat.</CommandEmpty>
              <CommandList>
                {(group) => (
                  <CommandGroup key={group.id} items={group.items}>
                    <CommandGroupLabel>{group.label}</CommandGroupLabel>
                    <CommandCollection>
                      {(action: AppPaletteAction) => (
                        <CommandItem
                          key={action.id}
                          value={action.searchValue}
                          onClick={() => executeAction(action)}
                        >
                          {action.icon}
                          <span className="truncate">{action.label}</span>
                          {action.shortcut === undefined ? null : (
                            <CommandShortcut>{action.shortcut}</CommandShortcut>
                          )}
                        </CommandItem>
                      )}
                    </CommandCollection>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </CommandPanel>
          <CommandFooter>
            <span>
              <kbd>↑↓</kbd> Naviguer
            </span>
            <span>
              <kbd>↵</kbd> Choisir
            </span>
            <span>
              <kbd>Esc</kbd> Fermer
            </span>
          </CommandFooter>
        </CommandDialogPopup>
      </CommandDialog>
    </AppPaletteContext.Provider>
  )
}
