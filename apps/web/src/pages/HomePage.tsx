import { Link } from "@tanstack/react-router"

export function HomePage() {
  return (
    <section>
      <p className="eyebrow">Noyau</p>
      <h1>Ton espace de travail agentique.</h1>
      <p>Une SPA React prête à accueillir les projets, channels, missions et tâches.</p>
      <Link className="button" to="/about">
        Découvrir le socle
      </Link>
    </section>
  )
}
