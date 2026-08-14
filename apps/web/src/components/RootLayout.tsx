import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { ActivityIcon, SparkleIcon } from "lucide-react"

import { AppSidebar } from "@/components/AppSidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

const pageMeta = {
  "/": { title: "Inbox" },
  "/projects/noyau/tasks": { title: "Tâches" },
  "/projects/noyau/channel": { title: "Canal" },
} as const

const getPageMeta = (pathname: string) => {
  const projectMatch = /^\/projects\/([^/]+)\/(board|channel)$/.exec(pathname)
  if (projectMatch !== null) {
    return {
      title: projectMatch[2] === "board" ? "Tableau" : "Canal",
    }
  }

  switch (pathname) {
    case "/":
      return pageMeta["/"]
    case "/projects/noyau/tasks":
      return pageMeta["/projects/noyau/tasks"]
    case "/projects/noyau/channel":
      return pageMeta["/projects/noyau/channel"]
    default:
      return { title: "Control room" }
  }
}

export function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const meta = getPageMeta(pathname)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-background/88 px-3 backdrop-blur-xl sm:px-5">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex min-w-0 items-center text-sm">
            <h1 className="truncate font-medium tracking-[-0.015em]">{meta.title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" aria-label="Activité des agents">
              <ActivityIcon />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden rounded-full bg-card shadow-xs sm:flex"
            >
              <SparkleIcon />
              Nouvelle action
            </Button>
          </div>
        </header>

        <Outlet />
      </SidebarInset>
    </SidebarProvider>
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
        Retour à l’inbox
      </Link>
    </section>
  )
}
