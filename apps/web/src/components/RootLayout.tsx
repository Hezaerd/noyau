import { Link, Outlet } from "@tanstack/react-router"

import { sandboxConfig } from "@/lib/sandbox-config"

const shortId = (id: string) => id.slice(0, 8)

export function RootLayout() {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
              N
            </span>
            <div>
              <p className="text-sm font-semibold tracking-[-0.01em] text-primary">Noyau</p>
              <p className="text-[0.68rem] text-subtle">Control plane personnel</p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1.5 font-medium text-accent">
              Sandbox
            </span>
            <div className="hidden min-w-0 items-center gap-2 text-subtle sm:flex">
              <span title={sandboxConfig.projectId}>
                Projet <span className="font-mono">{shortId(sandboxConfig.projectId)}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span title={sandboxConfig.missionId}>
                Mission <span className="font-mono">{shortId(sandboxConfig.missionId)}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate font-mono text-muted-foreground">
                {sandboxConfig.actorId}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-[calc(100vh-57px)] w-full px-4 sm:px-6">
        <Outlet />
      </main>
    </>
  )
}

export function NotFound() {
  return (
    <section className="mx-auto max-w-3xl py-20">
      <p className="text-subtle">404</p>
      <h1 className="my-3 max-w-[12ch] text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.96] font-normal tracking-[-0.06em] text-primary">
        Page introuvable
      </h1>
      <Link
        to="/"
        className="mt-8 inline-flex rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/80"
      >
        Retour aux tâches
      </Link>
    </section>
  )
}
