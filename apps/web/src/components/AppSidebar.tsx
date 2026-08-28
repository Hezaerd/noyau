import type { ProjectId } from "@noyau/contracts/ids"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { SearchIcon, SettingsIcon, SquarePenIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { ProjectFolderDialog } from "@/components/ProjectFolderDialog"
import { DesktopUpdateSidebarButton } from "@/components/sidebar/DesktopUpdateSidebarButton"
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
import {
  useProjectThreadIds,
  useProjects,
  useSelectProject,
  useSelectedProject,
} from "@/hooks/use-control-plane"
import { useKeybinding } from "@/hooks/use-keybindings"
import { buildAndDispatchCommand } from "@/lib/control-plane"
import { presentFailure } from "@/lib/failure-presentation"
import { showFailureToast } from "@/lib/failure-toast"
import { makeProjectDeleteRequest } from "@/lib/project-commands"
import { destinationAfterProjectRemoval, isViewingProject } from "@/lib/project-navigation"
import { DEFAULT_SETTINGS_TAB } from "@/lib/settings-catalog"

export function AppSidebar() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { isMobile, setOpenMobile } = useSidebar()
  const paletteHotkey = useKeybinding("palette.open")
  const settingsHotkey = useKeybinding("settings.open")
  const createThreadHotkey = useKeybinding("thread.create")
  const projects = useProjects()
  const selectedProject = useSelectedProject()
  const selectProject = useSelectProject()
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [rebindProjectId, setRebindProjectId] = useState<ProjectId>()
  const [deleteProjectId, setDeleteProjectId] = useState<ProjectId>()
  const pendingProjectIdRef = useRef<ProjectId | undefined>(undefined)
  const deleteThreadCount = useProjectThreadIds(deleteProjectId).length
  const closeMobileNavigation = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [isMobile, setOpenMobile])
  const selectSelectedProject = useCallback(() => {
    if (selectedProject === undefined) {
      return
    }
    selectProject(selectedProject.id)
    closeMobileNavigation()
  }, [closeMobileNavigation, selectProject, selectedProject])
  const openAddProjectDialog = () => {
    pendingProjectIdRef.current = undefined
    setRebindProjectId(undefined)
    setFolderDialogOpen(true)
  }
  const switchProject = (projectId: ProjectId) => {
    pendingProjectIdRef.current = undefined
    selectProject(projectId)
    closeMobileNavigation()
    void navigate({
      to: "/projects/$projectId/board",
      params: { projectId },
    })
  }

  useEffect(() => {
    const pendingProjectId = pendingProjectIdRef.current
    if (
      pendingProjectId === undefined ||
      !projects.some((project) => project.id === pendingProjectId)
    ) {
      return
    }
    pendingProjectIdRef.current = undefined
    void navigate({
      to: "/projects/$projectId/board",
      params: { projectId: pendingProjectId },
    })
  }, [navigate, projects])
  const deleteProject = () => {
    if (deleteProjectId === undefined) {
      return
    }
    const removedProjectId = deleteProjectId
    void buildAndDispatchCommand(makeProjectDeleteRequest({ projectId: removedProjectId })).then(
      (result) => {
        if (!result.ok) {
          showFailureToast(
            presentFailure(result.failure, {
              operation: "project.delete",
              scope: "project",
              initiatedByUser: true,
              hasUsableData: true,
            }),
          )
          return undefined
        }
        if (!isViewingProject(pathname, removedProjectId)) {
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

        <div className="flex items-center gap-1 p-3">
          <div className="min-w-0 flex-1">
            <CommandDialogTrigger
              render={
                <button
                  type="button"
                  aria-label="Open Palette"
                  className={sidebarSearchChromeClassName}
                />
              }
            >
              <SearchIcon className="size-3.5 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Search</span>
              <KeyboardShortcut
                hotkey={paletteHotkey}
                className="ml-auto group-data-[collapsible=icon]:hidden"
              />
            </CommandDialogTrigger>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="New Thread"
                  disabled={selectedProject === undefined}
                  className="size-9 shrink-0 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  render={
                    selectedProject === undefined ? undefined : (
                      <Link
                        to="/projects/$projectId/thread/$threadId"
                        params={{ projectId: selectedProject.id, threadId: "new" }}
                        onClick={() => {
                          selectProject(selectedProject.id)
                          closeMobileNavigation()
                        }}
                      />
                    )
                  }
                />
              }
            >
              <SquarePenIcon />
            </TooltipTrigger>
            <TooltipPopup side="right" className="inline-flex items-center gap-1.5">
              New Thread
              <KeyboardShortcut hotkey={createThreadHotkey} />
            </TooltipPopup>
          </Tooltip>
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

      <SidebarContent>
        <SidebarGroup className="p-0 px-2.5 pt-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {selectedProject === undefined ? null : (
                <ProjectSidebarItem
                  key={selectedProject.id}
                  project={selectedProject}
                  pathname={pathname}
                  onSelect={selectSelectedProject}
                />
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="flex flex-row items-center gap-1 p-3">
        <DesktopUpdateSidebarButton />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Open Settings"
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
            Settings
            <KeyboardShortcut hotkey={settingsHotkey} />
          </TooltipPopup>
        </Tooltip>
      </SidebarFooter>
      <ProjectFolderDialog
        open={folderDialogOpen || rebindProjectId !== undefined}
        projectId={rebindProjectId}
        onProjectCreated={(projectId) => {
          selectProject(projectId)
          pendingProjectIdRef.current = projectId
          closeMobileNavigation()
        }}
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
            projects.find((project) => project.id === deleteProjectId)?.name ?? "this Project"
          }
          threadCount={deleteThreadCount}
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
