import { ThreadId } from "@noyau/contracts/ids"
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
import { useLastProjectId, useProjectThreads } from "@/hooks/use-control-plane"
import { useKeybindingHandler } from "@/hooks/use-keybinding-handler"
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
import {
  getHotkeysPlatform,
  paletteItemHotkey,
  paletteItemModifierPressed,
} from "@/lib/keyboard-shortcut"
import { DEFAULT_SETTINGS_TAB, isSettingsPath } from "@/lib/settings-catalog"
import { prefetchThreadSnapshot } from "@/lib/thread-snapshot-prefetch"
import { setKeybindingPaletteOpen } from "@/state/keybinding-context"

const RECENT_ACTIONS_STORAGE_KEY = "noyau.palette.recent-actions"

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
  const lastProjectId = useLastProjectId()
  const threads = useProjectThreads(lastProjectId)
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
    setKeybindingPaletteOpen(open)
    return () => setKeybindingPaletteOpen(false)
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

  useKeybindingHandler("palette.open", () => setOpen(true))
  useKeybindingHandler("settings.open", openSettings)
  useKeybindingHandler("thread.create", openNewThread, lastProjectId !== undefined)

  const navigationActions = useMemo<ReadonlyArray<AppPaletteAction>>(() => {
    const actions: Array<AppPaletteAction & { readonly path: string }> = [
      {
        id: "navigate.settings",
        label: "Settings",
        searchValue: "Go to Settings settings general appearance providers shortcuts keybindings",
        path: `/settings/${DEFAULT_SETTINGS_TAB}`,
        icon: <SettingsIcon />,
        execute: openSettings,
      },
    ]
    if (lastProjectId !== undefined) {
      actions.push({
        id: "navigate.board",
        label: "Board",
        searchValue: "Go to Board",
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
      label: "New Thread",
      searchValue: "New Thread create conversation",
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
        prefetch: () => prefetchThreadSnapshot(ThreadId.make(thread.threadId)),
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

  useEffect(() => {
    if (!open) {
      return
    }
    const firstThread = groups
      .flatMap((group) => group.items)
      .find((action) => action.prefetch !== undefined)
    firstThread?.prefetch?.()
  }, [groups, open])
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
              <CommandInput placeholder="Search an action, page, ticket, or Thread…" />
              <CommandEmpty>No results.</CommandEmpty>
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
                          onMouseEnter={() => action.prefetch?.()}
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
              Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <KeyboardShortcut hotkey="Enter" />
              Choose
            </span>
            <span className="inline-flex items-center gap-1">
              <KeyboardShortcut hotkey="Escape" />
              Close
            </span>
          </CommandFooter>
        </CommandDialogPopup>
      </CommandDialog>
    </AppPaletteContext.Provider>
  )
}
