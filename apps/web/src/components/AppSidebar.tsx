import type { ProjectId } from "@noyau/protocol/ids"
import { Link, useRouterState } from "@tanstack/react-router"
import { PlusIcon, SearchIcon, SettingsIcon } from "lucide-react"
import { useState } from "react"

import { useControlPlane } from "@/components/control-plane-context"
import { ProjectFolderDialog } from "@/components/ProjectFolderDialog"
import { ProjectSidebarItem } from "@/components/sidebar/ProjectSidebarItem"
import { SidebarBrandTitlebar } from "@/components/sidebar/SidebarBrandTitlebar"
import { Button } from "@/components/ui/button"
import { CommandDialogTrigger } from "@/components/ui/command"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useKeybinding } from "@/hooks/use-keybindings"
import { DEFAULT_SETTINGS_TAB } from "@/lib/settings-catalog"

export function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { isMobile, setOpenMobile } = useSidebar()
  const paletteHotkey = useKeybinding("palette.open")
  const settingsHotkey = useKeybinding("settings.open")
  const { projects, threads, selectProject } = useControlPlane()
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [rebindProjectId, setRebindProjectId] = useState<ProjectId>()
  const closeMobileNavigation = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <>
      <SidebarHeader className="gap-0 p-0">
        <SidebarBrandTitlebar />

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
              {projects.map((project) => (
                <ProjectSidebarItem
                  key={project.id}
                  project={project}
                  threads={threads.filter((thread) => thread.projectId === project.id)}
                  remainingProjects={projects.filter((candidate) => candidate.id !== project.id)}
                  pathname={pathname}
                  onSelect={() => {
                    selectProject(project.id)
                    closeMobileNavigation()
                  }}
                  onRebind={() => {
                    setFolderDialogOpen(false)
                    setRebindProjectId(project.id)
                  }}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Ouvrir les Paramètres"
                className="text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                render={
                  <Link
                    to="/settings/$tab"
                    params={{ tab: DEFAULT_SETTINGS_TAB }}
                    onClick={closeMobileNavigation}
                  />
                }
              >
                <SettingsIcon />
              </Button>
            }
          />
          <TooltipPopup side="top" className="inline-flex items-center gap-1.5">
            Paramètres
            <KeyboardShortcut hotkey={settingsHotkey} />
          </TooltipPopup>
        </Tooltip>
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
    </>
  )
}
