import type { ProjectId } from "@noyau/protocol/ids"
import { Link, useRouterState } from "@tanstack/react-router"
import {
  ChevronsUpDownIcon,
  LayoutGridIcon,
  MessageCircleIcon,
  MessageCirclePlusIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react"
import { useState } from "react"

import { useControlPlane } from "@/components/control-plane-context"
import { ProjectFolderDialog } from "@/components/ProjectFolderDialog"
import { ThreadSidebarSection } from "@/components/sidebar/ThreadSidebarSection"
import { Button } from "@/components/ui/button"
import { CommandDialogTrigger } from "@/components/ui/command"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useKeybinding } from "@/hooks/use-keybindings"

export function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { isMobile, setOpenMobile } = useSidebar()
  const paletteHotkey = useKeybinding("palette.open")
  const { projects, threads, selectProject } = useControlPlane()
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [rebindProjectId, setRebindProjectId] = useState<ProjectId>()
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
          <div aria-hidden className="size-8 shrink-0 rounded-xl bg-sidebar-primary shadow-lg/5" />
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold tracking-[-0.02em]">Noyau</p>
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
              hotkey={paletteHotkey}
              className="ml-auto group-data-[collapsible=icon]:hidden"
            />
          </CommandDialogTrigger>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="pt-1">
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Projects</span>
            <button
              type="button"
              className="rounded p-1 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              aria-label="Relier un dossier"
              title="Relier un dossier"
              onClick={() => {
                setRebindProjectId(undefined)
                setFolderDialogOpen(true)
              }}
            >
              <PlusIcon />
            </button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => {
                const projectThreads = threads.filter((thread) => thread.projectId === project.id)
                return (
                  <SidebarMenuItem key={project.id}>
                    <div className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                        {project.name.slice(0, 2).toLocaleLowerCase("fr")}
                      </div>
                      <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                        <p className="truncate text-xs font-medium text-sidebar-foreground">
                          {project.name}
                        </p>
                      </div>
                      {project.available ? (
                        <ChevronsUpDownIcon className="size-3 text-sidebar-foreground/30 group-data-[collapsible=icon]:hidden" />
                      ) : (
                        <button
                          type="button"
                          className="text-[0.62rem] text-warning underline-offset-2 hover:underline group-data-[collapsible=icon]:hidden"
                          onClick={() => {
                            setFolderDialogOpen(false)
                            setRebindProjectId(project.id)
                          }}
                        >
                          Relier
                        </button>
                      )}
                    </div>
                    <SidebarMenuButton
                      render={
                        <Link
                          to="/projects/$projectId/board"
                          params={{ projectId: project.id }}
                          onClick={() => {
                            selectProject(project.id)
                            closeMobileNavigation()
                          }}
                        />
                      }
                      isActive={pathname === `/projects/${project.id}/board`}
                      tooltip="Tableau"
                      className="h-8 text-sidebar-foreground/58"
                    >
                      <LayoutGridIcon />
                      <span>Tableau</span>
                    </SidebarMenuButton>
                    <SidebarMenuButton
                      render={
                        <Link
                          to="/projects/$projectId/thread/$threadId"
                          params={{ projectId: project.id, threadId: "new" }}
                          onClick={() => {
                            selectProject(project.id)
                            closeMobileNavigation()
                          }}
                        />
                      }
                      isActive={pathname === `/projects/${project.id}/thread/new`}
                      tooltip="Nouveau Thread"
                      className="mt-1 h-8 pl-8 text-sidebar-foreground/58"
                    >
                      <MessageCirclePlusIcon />
                      <span>Nouveau Thread</span>
                    </SidebarMenuButton>
                    <ThreadSidebarSection
                      threads={projectThreads}
                      renderThread={(thread) => (
                        <SidebarMenuButton
                          key={thread.id}
                          render={
                            <Link
                              to="/projects/$projectId/thread/$threadId"
                              params={{ projectId: project.id, threadId: thread.id }}
                              onClick={() => {
                                selectProject(project.id)
                                closeMobileNavigation()
                              }}
                            />
                          }
                          isActive={pathname === `/projects/${project.id}/thread/${thread.id}`}
                          tooltip={thread.title}
                          className="h-8 pl-8 text-sidebar-foreground/58"
                        >
                          <MessageCircleIcon />
                          <span className="truncate">{thread.title}</span>
                        </SidebarMenuButton>
                      )}
                    />
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Ouvrir les Paramètres"
          className="text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          render={
            <Link
              to="/settings/$tab"
              params={{ tab: "appearance" }}
              onClick={closeMobileNavigation}
            />
          }
        >
          <SettingsIcon />
        </Button>
      </SidebarFooter>
      <ProjectFolderDialog
        open={folderDialogOpen || rebindProjectId !== undefined}
        projectId={rebindProjectId}
        onOpenChange={(open) => {
          if (!open) {
            setFolderDialogOpen(false)
            setRebindProjectId(undefined)
          }
        }}
      />
    </Sidebar>
  )
}
