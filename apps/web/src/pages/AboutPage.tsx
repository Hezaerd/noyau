export function AboutPage() {
  return (
    <section className="max-w-3xl py-20">
      <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">Socle web</p>
      <h1 className="my-3 max-w-[12ch] text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.96] font-normal tracking-[-0.06em] text-white">
        Vite, React et TanStack Router.
      </h1>
      <p className="max-w-2xl text-lg leading-relaxed text-muted">
        Le routage typé et basé sur les fichiers est configuré pour faire évoluer l’interface.
      </p>
    </section>
  )
}
