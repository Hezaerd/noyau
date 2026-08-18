import { Link, useRouterState } from "@tanstack/react-router"
import {
  ChevronsUpDownIcon,
  InboxIcon,
  LayoutGridIcon,
  MessageCircleIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"

import { AppearanceMenu } from "@/components/AppearanceMenu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CommandDialogTrigger } from "@/components/ui/command"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { HOTKEY_COMMAND_PALETTE } from "@/lib/keyboard-shortcut"

export function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { isMobile, setOpenMobile } = useSidebar()
  const closeMobileNavigation = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar collapsible="offcanvas" className="border-sidebar-border/70">
      <SidebarHeader className="gap-0 p-0">
        <div
          className="drag-region flex h-(--desktop-titlebar-height) shrink-0 items-center gap-2 border-b border-sidebar-border/70 px-3"
          data-desktop-sidebar-titlebar=""
        >
          <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-lg/5">
            N
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold tracking-[-0.02em]">Noyau</p>
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <AppearanceMenu />
          </div>
        </div>

        <div className="p-3">
          <CommandDialogTrigger
            render={
              <button
                type="button"
                aria-label="Ouvrir la Palette"
                className="flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/45 px-2.5 text-xs text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0"
              />
            }
          >
            <SearchIcon className="size-3.5 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Rechercher</span>
            <KeyboardShortcut
              hotkey={HOTKEY_COMMAND_PALETTE}
              className="ml-auto group-data-[collapsible=icon]:hidden"
            />
          </CommandDialogTrigger>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="pt-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link to="/" onClick={closeMobileNavigation} />}
                isActive={pathname === "/"}
                tooltip="Inbox"
                className="h-9 text-sidebar-foreground/68"
              >
                <InboxIcon />
                <span>Inbox</span>
              </SidebarMenuButton>
              <SidebarMenuBadge className="bg-sidebar-primary text-[0.65rem] text-sidebar-primary-foreground">
                4
              </SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator className="my-2 opacity-60" />

        <SidebarGroup className="pt-1">
          <SidebarGroupLabel className="sr-only">Projets suivis</SidebarGroupLabel>
          <SidebarGroupAction aria-label="Ajouter un projet" title="Ajouter un projet">
            <PlusIcon />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <div className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                no
              </div>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-medium text-sidebar-foreground">noyau</p>
              </div>
              <ChevronsUpDownIcon className="size-3 text-sidebar-foreground/30 group-data-[collapsible=icon]:hidden" />
            </div>

            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/projects/$projectId/board"
                      params={{ projectId: "noyau" }}
                      onClick={closeMobileNavigation}
                    />
                  }
                  isActive={pathname === "/projects/noyau/board"}
                  tooltip="Tableau"
                  className="h-8 text-sidebar-foreground/58"
                >
                  <LayoutGridIcon />
                  <span>Tableau</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[0.65rem] text-sidebar-foreground/35">
                  7
                </SidebarMenuBadge>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to="/projects/noyau/channel" onClick={closeMobileNavigation} />}
                  isActive={pathname === "/projects/noyau/channel"}
                  tooltip="Canal"
                  className="h-8 text-sidebar-foreground/58"
                >
                  <MessageCircleIcon />
                  <span>Canal</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-[0.65rem] text-sidebar-foreground/35">
                  2
                </SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-sidebar-border/60 bg-sidebar-accent/30 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
          <Avatar className="size-7 rounded-lg">
            <AvatarFallback className="rounded-lg bg-sidebar-primary/20 text-[0.66rem] font-semibold text-sidebar-primary">
              H
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-xs font-medium">Hezaerd</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
