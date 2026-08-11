import { Link, Outlet } from "@tanstack/react-router"

export function RootLayout() {
  return (
    <>
      <header className="border-b border-border">
        <nav
          aria-label="Navigation principale"
          className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-4"
        >
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className="text-subtle transition-colors hover:text-primary data-[status=active]:text-primary"
          >
            Accueil
          </Link>
          <Link
            to="/about"
            className="text-subtle transition-colors hover:text-primary data-[status=active]:text-primary"
          >
            À propos
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-57px)] w-full max-w-6xl items-center px-4">
        <Outlet />
      </main>
    </>
  )
}

export function NotFound() {
  return (
    <section className="max-w-3xl py-20">
      <p className="text-subtle">404</p>
      <h1 className="my-3 max-w-[12ch] text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.96] font-normal tracking-[-0.06em] text-primary">
        Page introuvable
      </h1>
      <Link
        to="/"
        className="mt-8 inline-flex rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/80"
      >
        Retour à l’accueil
      </Link>
    </section>
  )
}
