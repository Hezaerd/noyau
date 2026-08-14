import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleHelp,
  GitPullRequest,
  MessageSquareText,
  Sparkles,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

const activity = [
  {
    actor: "Claude",
    initials: "CL",
    color: "bg-violet-500/15 text-violet-300",
    icon: GitPullRequest,
    title: "La refonte du moteur de receipts est prête à relire",
    detail: "PR #8 · 4 fichiers modifiés · check et tests passent",
    project: "noyau",
    time: "il y a 18 min",
    action: "Ouvrir la PR",
    tone: "default" as const,
  },
  {
    actor: "Marion",
    initials: "MA",
    color: "bg-primary/15 text-primary",
    icon: CircleHelp,
    title: "Une décision bloque la mission « Runtime Hermes »",
    detail: "Faut-il conserver les artefacts des runs échoués pendant 7 ou 30 jours ?",
    project: "noyau",
    time: "il y a 46 min",
    action: "Répondre",
    tone: "attention" as const,
  },
  {
    actor: "Reviewer",
    initials: "RV",
    color: "bg-indigo-500/15 text-indigo-300",
    icon: CheckCircle2,
    title: "Le lot « Event cursor opaque » a passé la revue",
    detail: "Aucun défaut bloquant · 23 tests validés",
    project: "noyau",
    time: "il y a 2 h",
    action: "Voir le rapport",
    tone: "default" as const,
  },
  {
    actor: "Marion",
    initials: "MA",
    color: "bg-primary/15 text-primary",
    icon: Sparkles,
    title: "Le plan de la mission « Inbox v1 » a été ajusté",
    detail: "2 tâches terminées · 1 tâche ajoutée après analyse du flux",
    project: "noyau",
    time: "hier, 22:14",
    action: "Voir la mission",
    tone: "default" as const,
  },
] as const

const agents = [
  { name: "Marion", role: "Orchestration", initials: "MA", status: "active" },
  { name: "Claude", role: "Développement", initials: "CL", status: "active" },
  { name: "Reviewer", role: "Revue", initials: "RV", status: "idle" },
] as const

export function InboxPage() {
  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="max-w-xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
                Voilà ce qui s’est passé pendant ton absence.
              </h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Dernière visite hier à 18:42 · priorité aux décisions qui attendent ton retour
              </p>
            </div>
            <Button variant="outline" className="w-fit rounded-full bg-card shadow-xs">
              <Check />
              Tout marquer comme lu
            </Button>
          </header>

          <div className="overflow-hidden rounded-2xl border border-border/90 bg-card shadow-[0_18px_60px_rgba(53,38,122,0.16)]">
            <div className="flex justify-end border-b border-border/70 px-5 py-3.5 sm:px-6">
              <span className="text-xs text-muted-foreground">12 août</span>
            </div>

            {activity.map((item, index) => (
              <article
                key={item.title}
                className={`group relative grid gap-4 px-5 py-5 transition-colors hover:bg-muted/35 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6 ${
                  index === activity.length - 1 ? "" : "border-b border-border/65"
                } ${item.tone === "attention" ? "bg-violet-500/5" : ""}`}
              >
                {item.tone === "attention" ? (
                  <span className="absolute inset-y-0 left-0 w-0.5 bg-violet-400" />
                ) : null}
                <Avatar className="size-9 rounded-xl">
                  <AvatarFallback
                    className={`rounded-xl text-[0.66rem] font-semibold ${item.color}`}
                  >
                    {item.initials}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <item.icon className="size-3.5 text-muted-foreground" />
                    <p className="text-[0.7rem] font-medium text-muted-foreground">
                      {item.actor} · {item.project}
                    </p>
                    <span className="text-[0.68rem] text-muted-foreground/70">{item.time}</span>
                  </div>
                  <h3 className="text-sm leading-snug font-medium tracking-[-0.01em] sm:text-[0.95rem]">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    {item.detail}
                  </p>
                </div>

                <Button
                  variant={item.tone === "attention" ? "default" : "ghost"}
                  size="sm"
                  className="w-fit shrink-0 self-center rounded-full"
                >
                  {item.action}
                  <ArrowUpRight />
                </Button>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-7">
          <section>
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
              <div className="space-y-4">
                {agents.map((agent) => (
                  <div key={agent.name} className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="size-8 rounded-lg">
                        <AvatarFallback className="rounded-lg bg-secondary text-[0.62rem] font-semibold">
                          {agent.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card ${
                          agent.status === "active" ? "bg-violet-400" : "bg-indigo-400"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{agent.name}</p>
                      <p className="truncate text-[0.68rem] text-muted-foreground">{agent.role}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Separator className="my-4" />
              <button
                type="button"
                className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Voir tous les runs
                <ArrowUpRight className="size-3.5" />
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-violet-500/15 bg-[#15131d] p-5 text-foreground shadow-[0_18px_48px_rgba(68,48,150,0.2)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-medium">Control plane durable</h3>
              </div>
              <MessageSquareText className="size-4 text-violet-300" />
            </div>
            <div className="mb-2 flex items-end justify-between">
              <span className="text-3xl font-semibold tracking-[-0.04em]">68%</span>
              <span className="text-[0.68rem] text-white/45">8 / 12 tâches</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[68%] rounded-full bg-primary" />
            </div>
          </section>
        </aside>
      </div>
    </main>
  )
}
