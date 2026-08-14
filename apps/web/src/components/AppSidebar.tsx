import {
  CaretUpDown,
  ChatCircleText,
  Gear,
  MagnifyingGlass,
  Plus,
  SquaresFour,
  Tray,
} from "@phosphor-icons/react"
import { Link, useRouterState } from "@tanstack/react-router"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
      <SidebarHeader className="gap-3 p-3">
        <div className="flex h-10 items-center gap-2 px-1">
          <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-lg/5">
            N
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold tracking-[-0.02em]">Noyau</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Paramètres"
            className="text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:hidden"
          >
            <Gear />
          </Button>
        </div>

        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/45 px-2.5 text-xs text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0"
        >
          <MagnifyingGlass className="size-3.5 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">Rechercher</span>
          <kbd className="ml-auto rounded border border-sidebar-border bg-sidebar px-1.5 py-0.5 font-sans text-[0.6rem] group-data-[collapsible=icon]:hidden">
            ⌘ K
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="pt-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link to="/" onClick={closeMobileNavigation} />}
                isActive={pathname === "/"}
                tooltip="Inbox"
                className="h-9 text-sidebar-foreground/68 data-active:bg-sidebar-accent data-active:text-sidebar-foreground"
              >
                <Tray />
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
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <div className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                no
              </div>
              <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-xs font-medium text-sidebar-foreground">noyau</p>
              </div>
              <CaretUpDown className="size-3 text-sidebar-foreground/30 group-data-[collapsible=icon]:hidden" />
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
                  className="h-8 text-sidebar-foreground/58 data-active:bg-sidebar-accent data-active:text-sidebar-foreground"
                >
                  <SquaresFour />
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
                  className="h-8 text-sidebar-foreground/58 data-active:bg-sidebar-accent data-active:text-sidebar-foreground"
                >
                  <ChatCircleText />
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
