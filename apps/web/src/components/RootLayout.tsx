import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { RotateCcwIcon } from "lucide-react"

import { AppPaletteProvider } from "@/components/AppPalette"
import { AppSidebar } from "@/components/AppSidebar"
import { ControlPlaneProvider } from "@/components/control-plane-context"
import { ScopeBanner } from "@/components/failure/FailureSurfaces"
import { SettingsSidebar } from "@/components/settings/SettingsSidebar"
import { Button } from "@/components/ui/button"
import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip"
import { SettingsPageTitle, ThreadPageTitle } from "@/components/WorkspaceBreadcrumb"
import { useControlPlane } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { useSettingsTabRestore } from "@/hooks/use-settings-tab-restore"
import { presentFailure } from "@/lib/failure-presentation"
import { resolvePageTitlebar } from "@/lib/page-titlebar"
import { isSettingsPath, resolveSettingsTabFromPathname } from "@/lib/settings-catalog"

function SidebarControl() {
  return (
    <div
      className="pointer-events-none fixed left-[var(--desktop-controls-left)] top-0 z-50 flex h-(--desktop-titlebar-height) items-center"
      data-sidebar-control=""
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <SidebarTrigger
              aria-label="Basculer la sidebar"
              className="pointer-events-auto text-muted-foreground"
            />
          }
        />
        <TooltipPopup side="bottom">Basculer la sidebar</TooltipPopup>
      </Tooltip>
    </div>
  )
}

function DesktopPageTitle() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { projects, threads } = useControlPlane()
  const titlebar = resolvePageTitlebar({ pathname, projects, threads })

  if (titlebar.kind === "settings") {
    return <SettingsPageTitle tabLabel={titlebar.tabLabel} />
  }

  if (titlebar.kind === "thread") {
    return <ThreadPageTitle projectName={titlebar.projectName} threadTitle={titlebar.threadTitle} />
  }

  return <h1 className="truncate font-medium tracking-[-0.015em]">{titlebar.title}</h1>
}

function SettingsRestoreAction() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const tab = resolveSettingsTabFromPathname(pathname)
  const { canRestore, restore } = useSettingsTabRestore(tab.id)

  if (!tab.restorable) {
    return null
  }

  return (
    <div className="ms-auto">
      <Button type="button" size="xs" variant="ghost" disabled={!canRestore} onClick={restore}>
        <RotateCcwIcon data-icon="inline-start" />
        Restaurer les défauts
      </Button>
    </div>
  )
}

function ShellConnectionNotice() {
  const { shell, subscriptionStatus } = useControlPlane()
  const failure = useDelayedSubscriptionFailure(subscriptionStatus)
  if (failure === undefined || shell === undefined) return null
  return (
    <ScopeBanner
      presentation={presentFailure(failure, {
        operation: "shell.subscribe",
        scope: "shell",
        initiatedByUser: false,
        hasUsableData: true,
      })}
    />
  )
}

export function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const isSettings = isSettingsPath(pathname)

  return (
    <ControlPlaneProvider>
      <AppPaletteProvider>
        <SidebarProvider className="h-svh overflow-hidden">
          {/* Keep the Sidebar shell mounted: remounting it retriggers
              transition-[width,left] on the gap and flashes the chrome. */}
          <Sidebar collapsible="offcanvas" className="border-sidebar-border/70">
            {isSettings ? <SettingsSidebar /> : <AppSidebar />}
          </Sidebar>
          <SidebarInset className="min-h-0 min-w-0 overflow-hidden overscroll-y-none">
            {/* Keep the page titlebar mounted: swapping it with the Settings
                header unmounts the chrome for one frame. */}
            <header
              className="drag-region z-30 flex h-(--desktop-titlebar-height) min-h-(--desktop-titlebar-height) shrink-0 items-center gap-3 border-b border-border/70 bg-background/88 px-3 backdrop-blur-xl sm:px-5"
              data-desktop-page-titlebar=""
            >
              <div className="flex min-w-0 items-center text-sm">
                <DesktopPageTitle />
              </div>
              {isSettings ? <SettingsRestoreAction /> : null}
            </header>

            <ShellConnectionNotice />

            <Outlet />
          </SidebarInset>
          <SidebarControl />
        </SidebarProvider>
      </AppPaletteProvider>
    </ControlPlaneProvider>
  )
}

export function NotFound() {
  return (
    <section className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-2xl flex-col justify-center px-6 py-20">
      <h1 className="my-3 text-4xl font-semibold tracking-[-0.045em] text-foreground">
        Page introuvable
      </h1>
      <Link
        to="/"
        className="mt-6 inline-flex w-fit rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Retour au Tableau
      </Link>
    </section>
  )
}
