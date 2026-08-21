import type { ProjectId } from "@noyau/protocol/ids"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { SearchIcon, SettingsIcon } from "lucide-react"
import { useState } from "react"

import { ProjectFolderDialog } from "@/components/ProjectFolderDialog"
import { ProjectDeleteConfirmDialog } from "@/components/sidebar/ProjectDeleteConfirmDialog"
import { ProjectSidebarItem } from "@/components/sidebar/ProjectSidebarItem"
import { ProjectSwitcher } from "@/components/sidebar/ProjectSwitcher"
import { sidebarSearchChromeClassName } from "@/components/sidebar/sidebar-search-chrome"
import { SidebarBrandTitlebar } from "@/components/sidebar/SidebarBrandTitlebar"
import { Button } from "@/components/ui/button"
import { CommandDialogTrigger } from "@/components/ui/command"
import { KeyboardShortcut } from "@/components/ui/keyboard-shortcut"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { useControlPlane } from "@/hooks/use-control-plane"
import { useKeybinding } from "@/hooks/use-keybindings"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { makeProjectDeleteRequest } from "@/lib/project-commands"
import { destinationAfterProjectRemoval, isViewingProject } from "@/lib/project-navigation"
import { DEFAULT_SETTINGS_TAB } from "@/lib/settings-catalog"

export function AppSidebar() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { isMobile, setOpenMobile } = useSidebar()
  const paletteHotkey = useKeybinding("palette.open")
  const settingsHotkey = useKeybinding("settings.open")
  const { projects, threads, lastProjectId, selectProject } = useControlPlane()
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [rebindProjectId, setRebindProjectId] = useState<ProjectId>()
  const [deleteProjectId, setDeleteProjectId] = useState<ProjectId>()
  const selectedProject = projects.find((project) => project.id === lastProjectId) ?? projects[0]
  const selectedProjectThreads = selectedProject
    ? threads.filter((thread) => thread.projectId === selectedProject.id)
    : []
  const closeMobileNavigation = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }
  const openAddProjectDialog = () => {
    setRebindProjectId(undefined)
    setFolderDialogOpen(true)
  }
  const switchProject = (projectId: ProjectId) => {
    selectProject(projectId)
    closeMobileNavigation()
    void navigate({
      to: "/projects/$projectId/board",
      params: { projectId },
    })
  }
  const deleteProject = () => {
    if (deleteProjectId === undefined) {
      return
    }
    const removedProjectId = deleteProjectId
    void buildAndDispatchCommand(makeProjectDeleteRequest({ projectId: removedProjectId })).then(
      (result) => {
        if (!result.ok || !isViewingProject(pathname, removedProjectId)) {
          return undefined
        }
        const destination = destinationAfterProjectRemoval(
          projects.filter((project) => project.id !== removedProjectId),
        )
        return destination.to === "/"
          ? navigate({ to: "/", replace: true })
          : navigate({
              to: destination.to,
              params: { projectId: destination.projectId },
              replace: true,
            })
      },
    )
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
                className={sidebarSearchChromeClassName}
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
        <ProjectSwitcher
          projects={projects}
          selectedProject={selectedProject}
          onSelect={switchProject}
          onAdd={openAddProjectDialog}
          onRebind={() => {
            if (selectedProject !== undefined) {
              setFolderDialogOpen(false)
              setRebindProjectId(selectedProject.id)
            }
          }}
          onRemove={() => {
            if (selectedProject !== undefined) {
              setDeleteProjectId(selectedProject.id)
            }
          }}
        />
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {selectedProject === undefined ? null : (
                <ProjectSidebarItem
                  key={selectedProject.id}
                  project={selectedProject}
                  threads={selectedProjectThreads}
                  pathname={pathname}
                  onSelect={() => {
                    selectProject(selectedProject.id)
                    closeMobileNavigation()
                  }}
                />
              )}
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
                size="icon"
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
      {deleteProjectId === undefined ? null : (
        <ProjectDeleteConfirmDialog
          open
          projectName={
            projects.find((project) => project.id === deleteProjectId)?.name ?? "ce Project"
          }
          threadCount={threads.filter((thread) => thread.projectId === deleteProjectId).length}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteProjectId(undefined)
            }
          }}
          onConfirm={deleteProject}
        />
      )}
    </>
  )
}
