import { Link, Outlet, useRouterState } from "@tanstack/react-router"

import { AppPaletteProvider } from "@/components/AppPalette"
import { ControlPlaneProvider } from "@/components/control-plane-context"
import { AppSidebar } from "@/components/AppSidebar"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

const pageMeta = {
  "/": { title: "Tableau" },
} as const

const getPageMeta = (pathname: string) => {
  const projectMatch = /^\/projects\/([^/]+)\/board$/.exec(pathname)
  if (projectMatch !== null) {
    return { title: "Tableau" }
  }

  switch (pathname) {
    case "/":
      return pageMeta["/"]
    default:
      return { title: "Control room" }
  }
}

export function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const meta = getPageMeta(pathname)

  return (
    <ControlPlaneProvider>
      <AppPaletteProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0 overflow-hidden">
            <header
              className="drag-region sticky top-0 z-30 flex h-(--desktop-titlebar-height) min-h-(--desktop-titlebar-height) shrink-0 items-center gap-3 border-b border-border/70 bg-background/88 px-3 backdrop-blur-xl sm:px-5"
              data-desktop-page-titlebar=""
            >
              <SidebarTrigger className="-ml-1 text-muted-foreground" />
              <Separator orientation="vertical" className="h-4" />
              <div className="flex min-w-0 items-center text-sm">
                <h1 className="truncate font-medium tracking-[-0.015em]">{meta.title}</h1>
              </div>
            </header>

            <Outlet />
          </SidebarInset>
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
