import { useNavigate, useRouterState } from "@tanstack/react-router"
import {
  LayoutGridIcon,
  MessageCircleIcon,
  MessageCirclePlusIcon,
  SettingsIcon,
} from "lucide-react"
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
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import { useControlPlane } from "@/hooks/use-control-plane"
import { useKeybinding } from "@/hooks/use-keybindings"
import {
  buildPaletteGroups,
  filterPaletteGroups,
  paletteShortcutIndex,
  paletteThreadItems,
  parseRecentActionIds,
  type PaletteGroup,
  serializeRecentActionIds,
  updateRecentActionIds,
} from "@/lib/app-palette"
import { isKeybindingRecorderActive, matchesKeybinding } from "@/lib/keybindings"
import {
  getHotkeysPlatform,
  paletteItemHotkey,
  paletteItemModifierPressed,
} from "@/lib/keyboard-shortcut"
import { DEFAULT_SETTINGS_TAB, isSettingsPath } from "@/lib/settings-catalog"

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
  const { lastProjectId, threads } = useControlPlane()
  const threadCreateHotkey = useKeybinding("thread.create")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
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
        isKeybindingRecorderActive() ||
        !matchesKeybinding(event, "palette.open") ||
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

  const openSettings = useCallback(() => {
    if (isSettingsPath(pathname)) {
      return
    }
    setOpen(false)
    setQuery("")
    void navigate({
      to: "/settings/$tab",
      params: { tab: DEFAULT_SETTINGS_TAB },
    })
  }, [navigate, pathname])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isKeybindingRecorderActive() ||
        !matchesKeybinding(event, "settings.open")
      ) {
        return
      }
      event.preventDefault()
      openSettings()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [openSettings])

  const newThreadPath =
    lastProjectId === undefined ? undefined : `/projects/${lastProjectId}/thread/new`

  const openNewThread = useCallback(() => {
    if (lastProjectId === undefined) {
      return
    }
    setOpen(false)
    setQuery("")
    if (pathname === `/projects/${lastProjectId}/thread/new`) {
      return
    }
    void navigate({
      to: "/projects/$projectId/thread/$threadId",
      params: { projectId: lastProjectId, threadId: "new" },
    })
  }, [lastProjectId, navigate, pathname])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isKeybindingRecorderActive() ||
        !matchesKeybinding(event, "thread.create") ||
        lastProjectId === undefined ||
        (!open && document.querySelector('[role="dialog"]') !== null)
      ) {
        return
      }
      event.preventDefault()
      openNewThread()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [lastProjectId, open, openNewThread])

  const navigationActions = useMemo<ReadonlyArray<AppPaletteAction>>(() => {
    const actions: Array<AppPaletteAction & { readonly path: string }> = [
      {
        id: "navigate.settings",
        label: "Paramètres",
        searchValue: "Aller aux Paramètres settings apparence providers raccourcis keybindings",
        path: "/settings/appearance",
        icon: <SettingsIcon />,
        execute: openSettings,
      },
    ]
    if (lastProjectId !== undefined) {
      actions.push({
        id: "navigate.board",
        label: "Tableau",
        searchValue: "Aller au Tableau",
        path: `/projects/${lastProjectId}/board`,
        icon: <LayoutGridIcon />,
        execute: () =>
          navigate({
            to: "/projects/$projectId/board",
            params: { projectId: lastProjectId },
          }),
      })
    }
    return actions.filter((action) => {
      if (action.id === "navigate.settings") {
        return !isSettingsPath(pathname)
      }
      return action.path !== pathname
    })
  }, [lastProjectId, navigate, openSettings, pathname])

  const contextualActions = useMemo(() => {
    const pageVerbs = pageActions.filter(
      (action) => action.category !== "ticket" && action.category !== "thread",
    )
    if (lastProjectId === undefined || pathname === newThreadPath) {
      return pageVerbs
    }
    const createThread: AppPaletteAction = {
      id: "thread.create",
      label: "Nouveau Thread",
      searchValue: "Nouveau Thread créer conversation",
      shortcut: threadCreateHotkey,
      icon: <MessageCirclePlusIcon />,
      execute: openNewThread,
    }
    return [createThread, ...pageVerbs]
  }, [lastProjectId, newThreadPath, openNewThread, pageActions, pathname, threadCreateHotkey])
  const ticketActions = useMemo(
    () => pageActions.filter((action) => action.category === "ticket"),
    [pageActions],
  )
  const threadActions = useMemo<ReadonlyArray<AppPaletteAction>>(
    () =>
      paletteThreadItems(threads, lastProjectId).map((thread) => ({
        id: thread.id,
        label: thread.label,
        searchValue: thread.searchValue,
        category: "thread" as const,
        icon: <MessageCircleIcon />,
        execute: () => {
          if (lastProjectId === undefined) {
            return
          }
          void navigate({
            to: "/projects/$projectId/thread/$threadId",
            params: { projectId: lastProjectId, threadId: thread.threadId },
          })
        },
      })),
    [lastProjectId, navigate, threads],
  )
  const groups = useMemo(() => {
    const baseGroups = buildPaletteGroups(contextualActions, navigationActions, recentActionIds)
    const searchableGroups: Array<PaletteGroup<AppPaletteAction>> = [...baseGroups]
    if (query.trim() !== "" && ticketActions.length > 0) {
      searchableGroups.push({ id: "tickets", label: "Tickets", items: ticketActions })
    }
    if (query.trim() !== "" && threadActions.length > 0) {
      searchableGroups.push({ id: "threads", label: "Threads", items: threadActions })
    }
    return filterPaletteGroups(searchableGroups, query)
  }, [contextualActions, navigationActions, query, recentActionIds, threadActions, ticketActions])
  const numberedActions = useMemo(
    () => groups.flatMap((group) => group.items).slice(0, 9),
    [groups],
  )
  const hotkeysPlatform = getHotkeysPlatform()
  const shortcutByActionId = useMemo(
    () =>
      new Map(
        numberedActions.map((action, index) => [
          action.id,
          paletteItemHotkey(index, hotkeysPlatform),
        ]),
      ),
    [hotkeysPlatform, numberedActions],
  )

  const executeAction = useCallback((action: AppPaletteAction): void => {
    setOpen(false)
    setQuery("")
    if (action.category !== "ticket" && action.category !== "thread") {
      setRecentActionIds((current) => updateRecentActionIds(current, action.id))
    }
    void action.execute()
  }, [])

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery("")
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }
    const handleNumberShortcut = (event: KeyboardEvent) => {
      const shortcutIndex = paletteShortcutIndex(event.code)
      const modifierPressed = paletteItemModifierPressed(event, hotkeysPlatform)
      if (
        event.defaultPrevented ||
        event.repeat ||
        !modifierPressed ||
        shortcutIndex === undefined ||
        shortcutIndex >= numberedActions.length
      ) {
        return
      }
      const action = numberedActions[shortcutIndex]
      if (action !== undefined) {
        event.preventDefault()
        executeAction(action)
      }
    }

    window.addEventListener("keydown", handleNumberShortcut)
    return () => window.removeEventListener("keydown", handleNumberShortcut)
  }, [executeAction, hotkeysPlatform, numberedActions, open])

  return (
    <AppPaletteContext.Provider value={context}>
      <CommandDialog open={open} onOpenChange={handleOpenChange}>
        {children}
        <CommandDialogPopup>
          <CommandDialogPrimitive.Title className="sr-only">Palette</CommandDialogPrimitive.Title>
          <CommandPanel>
            <Command filter={null} items={groups} value={query} onValueChange={setQuery}>
              <CommandInput placeholder="Rechercher une action, une page, un ticket ou un Thread…" />
              <CommandEmpty>Aucun résultat.</CommandEmpty>
              <CommandList>
                {(group) => (
                  <CommandGroup key={group.id} items={group.items}>
                    <CommandGroupLabel>{group.label}</CommandGroupLabel>
                    <CommandCollection>
                      {(action: AppPaletteAction) => (
                        <CommandItem
                          key={action.id}
                          className="gap-2"
                          value={action.searchValue}
                          onClick={() => executeAction(action)}
                        >
                          <span className="grid size-4 shrink-0 place-items-center [&>svg]:size-4">
                            {action.icon}
                          </span>
                          <span className="truncate">{action.label}</span>
                          {action.shortcut !== undefined || shortcutByActionId.has(action.id) ? (
                            <CommandShortcut
                              hotkey={action.shortcut ?? shortcutByActionId.get(action.id)!}
                            />
                          ) : null}
                        </CommandItem>
                      )}
                    </CommandCollection>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </CommandPanel>
          <CommandFooter>
            <span className="inline-flex items-center gap-1">
              <KeyboardShortcut hotkey="ArrowUp" />
              <KeyboardShortcut hotkey="ArrowDown" />
              Naviguer
            </span>
            <span className="inline-flex items-center gap-1">
              <KeyboardShortcut hotkey="Enter" />
              Choisir
            </span>
            <span className="inline-flex items-center gap-1">
              <KeyboardShortcut hotkey="Escape" />
              Fermer
            </span>
          </CommandFooter>
        </CommandDialogPopup>
      </CommandDialog>
    </AppPaletteContext.Provider>
  )
}
