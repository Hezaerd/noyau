import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { Activity, Bot } from "lucide-react"

import { AppSidebar } from "@/components/AppSidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

const pageMeta = {
  "/": { eyebrow: "Aujourd'hui", title: "Inbox" },
  "/projects/noyau/tasks": { eyebrow: "noyau", title: "Tâches" },
  "/projects/noyau/channel": { eyebrow: "noyau", title: "Canal" },
} as const

const getPageMeta = (pathname: string) => {
  switch (pathname) {
    case "/":
      return pageMeta["/"]
    case "/projects/noyau/tasks":
      return pageMeta["/projects/noyau/tasks"]
    case "/projects/noyau/channel":
      return pageMeta["/projects/noyau/channel"]
    default:
      return { eyebrow: "Noyau", title: "Control room" }
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
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">{meta.eyebrow}</span>
            <span className="hidden text-border sm:inline">/</span>
            <h1 className="truncate font-medium tracking-[-0.015em]">{meta.title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[0.68rem] text-muted-foreground shadow-xs sm:flex">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Control plane en ligne
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Activité des agents">
              <Activity />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden rounded-full bg-card shadow-xs sm:flex"
            >
              <Bot />
              Demander à Marion
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
      <p className="text-sm font-medium text-muted-foreground">404</p>
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
