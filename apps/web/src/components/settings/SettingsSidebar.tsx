import { useCanGoBack, useLocation, useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon, KeyboardIcon, PaletteIcon, SearchIcon, XIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactElement,
} from "react"

import { scrollToSettingsTargetId } from "@/components/settings/settings-layout"
import { SidebarBrandTitlebar } from "@/components/sidebar/SidebarBrandTitlebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useKeybinding } from "@/hooks/use-keybindings"
import { isKeybindingRecorderActive, matchesKeybinding } from "@/lib/keybindings"
import {
  searchSettings,
  SETTINGS_TABS,
  type SettingsSearchHit,
  type SettingsTabId,
} from "@/lib/settings-catalog"

const SETTINGS_TAB_ICONS = {
  appearance: PaletteIcon,
  keybindings: KeyboardIcon,
} as const satisfies Record<SettingsTabId, ComponentType<{ className?: string }>>

export function SettingsSidebar(): ReactElement {
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })
  const currentHash = useLocation({ select: (location) => location.hash })
  const canGoBack = useCanGoBack()
  const { isMobile, setOpenMobile, open, setOpen } = useSidebar()
  const searchHotkey = useKeybinding("settings.search")
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const results = useMemo(() => searchSettings(query), [query])
  const isSearching = query.trim().length > 0
  const hasResults = results.length > 0

  useEffect(() => {
    const result = results[activeResultIndex]
    if (result === undefined) {
      return
    }
    document
      .getElementById(`settings-search-result-${result.id}`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeResultIndex, results])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isKeybindingRecorderActive() || !matchesKeybinding(event, "settings.search")) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest('[role="dialog"], [aria-modal="true"], [data-slot$="popup"]') !== null)
      ) {
        return
      }

      event.preventDefault()
      if (isMobile) {
        setOpenMobile(true)
      } else if (!open) {
        setOpen(true)
      }
      requestAnimationFrame(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      })
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isMobile, open, setOpen, setOpenMobile, searchHotkey])

  const navigateBack = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
    if (canGoBack) {
      window.history.back()
      return
    }
    void navigate({ to: "/" })
  }, [canGoBack, isMobile, navigate, setOpenMobile])

  const handleTabClick = useCallback(
    (tabId: SettingsTabId) => {
      if (isMobile) {
        setOpenMobile(false)
      }
      void navigate({
        to: "/settings/$tab",
        params: { tab: tabId },
        hash: "",
        replace: true,
        hashScrollIntoView: false,
      })
    },
    [isMobile, navigate, setOpenMobile],
  )

  const clearSearch = useCallback(() => {
    setQuery("")
    setActiveResultIndex(0)
  }, [])

  const handleSearchResultClick = useCallback(
    (item: SettingsSearchHit) => {
      clearSearch()
      if (isMobile) {
        setOpenMobile(false)
      }
      if (pathname === item.tab.path && currentHash.replace(/^#/, "") === item.id) {
        scrollToSettingsTargetId(item.id)
        return
      }
      void navigate({
        to: "/settings/$tab",
        params: { tab: item.tab.id },
        hash: item.id,
        replace: true,
        hashScrollIntoView: false,
      })
    },
    [clearSearch, currentHash, isMobile, navigate, pathname, setOpenMobile],
  )

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape" && isSearching) {
        event.preventDefault()
        event.stopPropagation()
        clearSearch()
        return
      }
      if (results.length === 0) {
        return
      }
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveResultIndex((index) => (index + 1) % results.length)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveResultIndex((index) => (index - 1 + results.length) % results.length)
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        const result = results[activeResultIndex]
        if (result !== undefined) {
          handleSearchResultClick(result)
        }
      }
    },
    [activeResultIndex, clearSearch, handleSearchResultClick, isSearching, results],
  )

  return (
    <Sidebar collapsible="offcanvas" className="border-sidebar-border/70">
      <SidebarHeader className="gap-0 p-0">
        <SidebarBrandTitlebar />
      </SidebarHeader>
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup className="gap-2 p-3">
          <div className="flex h-8 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <SearchIcon className="size-4 shrink-0" />
            <Input
              ref={searchInputRef}
              nativeInput
              unstyled
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value)
                setActiveResultIndex(0)
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Rechercher"
              aria-label="Rechercher dans les Paramètres"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isSearching && hasResults}
              aria-controls={isSearching && hasResults ? "settings-search-results" : undefined}
              aria-activedescendant={
                isSearching && results[activeResultIndex] !== undefined
                  ? `settings-search-result-${results[activeResultIndex].id}`
                  : undefined
              }
              className="min-w-0 flex-1 [&_[data-slot=input]]:h-auto [&_[data-slot=input]]:p-0 [&_[data-slot=input]]:text-sm [&_[data-slot=input]]:font-medium [&_[data-slot=input]]:text-sidebar-foreground [&_[data-slot=input]]:placeholder:text-sidebar-foreground/50"
            />
            {isSearching ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="shrink-0 text-sidebar-foreground/55 hover:text-sidebar-foreground"
                aria-label="Effacer la recherche"
                onClick={() => {
                  clearSearch()
                  searchInputRef.current?.focus()
                }}
              >
                <XIcon />
              </Button>
            ) : (
              <KeyboardShortcut
                hotkey={searchHotkey}
                kbdClassName="h-4 min-w-0 px-1.5 text-[10px]"
              />
            )}
          </div>
          {isSearching && results.length === 0 ? (
            <p role="status" className="px-2 py-6 text-center text-xs text-sidebar-foreground/50">
              Aucun réglage trouvé
            </p>
          ) : null}
          <SidebarMenu
            id={isSearching && hasResults ? "settings-search-results" : undefined}
            role={isSearching && hasResults ? "listbox" : undefined}
            aria-label={isSearching && hasResults ? "Résultats des Paramètres" : undefined}
          >
            {isSearching
              ? results.map((item, index) => {
                  const Icon = SETTINGS_TAB_ICONS[item.tab.id]
                  return (
                    <SidebarMenuItem key={item.id} role="presentation">
                      <SidebarMenuButton
                        id={`settings-search-result-${item.id}`}
                        role="option"
                        aria-selected={index === activeResultIndex}
                        tabIndex={-1}
                        size="sm"
                        isActive={index === activeResultIndex}
                        className="h-auto min-h-10 items-start gap-2 py-2"
                        onMouseMove={() => setActiveResultIndex(index)}
                        onClick={() => handleSearchResultClick(item)}
                      >
                        <Icon />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          <span className="block truncate text-[11px] text-sidebar-foreground/50">
                            {item.tab.label}
                          </span>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })
              : SETTINGS_TABS.map((tab) => {
                  const Icon = SETTINGS_TAB_ICONS[tab.id]
                  return (
                    <SidebarMenuItem key={tab.id}>
                      <SidebarMenuButton
                        isActive={pathname === tab.path || pathname.startsWith(`${tab.path}/`)}
                        onClick={() => handleTabClick(tab.id)}
                      >
                        <Icon />
                        <span>{tab.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={navigateBack}>
              <ArrowLeftIcon />
              <span>Retour</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
