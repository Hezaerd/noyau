import { Link } from "@tanstack/react-router"

export function HomePage() {
  return (
    <section className="max-w-3xl py-20">
      <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">Noyau</p>
      <h1 className="my-3 max-w-[12ch] text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.96] font-normal tracking-[-0.06em] text-white">
        Ton espace de travail agentique.
      </h1>
      <p className="max-w-2xl text-lg leading-relaxed text-muted">
        Une SPA React prête à accueillir les projets, channels, missions et tâches.
      </p>
      <Link
        to="/about"
        className="mt-8 inline-flex rounded-full bg-white px-4 py-3 font-semibold text-surface transition-colors hover:bg-[#dcdce2]"
      >
        Découvrir le socle
      </Link>
    </section>
  )
}
