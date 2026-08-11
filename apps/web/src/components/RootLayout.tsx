import { Link, Outlet } from "@tanstack/react-router"

export function RootLayout() {
  return (
    <>
      <header>
        <nav aria-label="Navigation principale">
          <Link to="/" activeOptions={{ exact: true }}>
            Accueil
          </Link>
          <Link to="/about">À propos</Link>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>
    </>
  )
}

export function NotFound() {
  return (
    <section>
      <p>404</p>
      <h1>Page introuvable</h1>
      <Link to="/">Retour à l’accueil</Link>
    </section>
  )
}
