import {
  AtSignIcon,
  BotIcon,
  EllipsisIcon,
  HashIcon,
  PaperclipIcon,
  SendIcon,
  SparkleIcon,
} from "lucide-react"
import { useState, type FormEvent } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface ChannelMessage {
  readonly id: string
  readonly author: string
  readonly initials: string
  readonly role: string
  readonly time: string
  readonly body: string
  readonly tone: string
  readonly agent: boolean
}

const initialMessages: ReadonlyArray<ChannelMessage> = [
  {
    id: "message-1",
    author: "Marion",
    initials: "MA",
    role: "Orchestration",
    time: "09:18",
    body: "J’ai découpé la reprise du flux d’événements en trois tâches. Le curseur opaque doit être traité avant la reconnexion WebSocket pour garder une seule source d’ordre.",
    tone: "bg-primary/15 text-primary",
    agent: true,
  },
  {
    id: "message-2",
    author: "Claude",
    initials: "CL",
    role: "Développement",
    time: "09:24",
    body: "La première tâche est en cours. J’ai ajouté le verrou de projection et un test qui rejoue deux événements livrés au moins une fois.",
    tone: "bg-info/15 text-info-foreground",
    agent: true,
  },
  {
    id: "message-3",
    author: "Hezaerd",
    initials: "H",
    role: "Humain",
    time: "09:31",
    body: "Garde le transport hors du domaine. La reprise doit rester un détail de la frontière RPC.",
    tone: "bg-secondary text-secondary-foreground",
    agent: false,
  },
  {
    id: "message-4",
    author: "Reviewer",
    initials: "RV",
    role: "Revue",
    time: "10:02",
    body: "Compris. Je vérifierai aussi qu’aucun offset PostgreSQL n’est exposé au client dans le nouveau contrat.",
    tone: "bg-success/15 text-success-foreground",
    agent: true,
  },
]

export function ChannelPage() {
  const [messages, setMessages] = useState<ReadonlyArray<ChannelMessage>>(initialMessages)
  const [draft, setDraft] = useState("")

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const body = draft.trim()
    if (body === "") {
      return
    }

    setMessages((current) => [
      ...current,
      {
        id: `local-${current.length}`,
        author: "Hezaerd",
        initials: "H",
        role: "Humain",
        time: "maintenant",
        body,
        tone: "bg-secondary text-secondary-foreground",
        agent: false,
      },
    ])
    setDraft("")
  }

  return (
    <main className="flex min-h-[calc(100svh-3.5rem)] flex-1 flex-col">
      <header className="border-b border-border/70 bg-card/45 px-4 py-5 sm:px-7 lg:px-10">
        <div className="mx-auto flex w-full max-w-5xl items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card shadow-sm">
              <HashIcon className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold tracking-[-0.025em]">noyau</h2>
                <Badge
                  variant="outline"
                  className="rounded-full border-info/25 bg-info/10 text-[0.62rem] text-info-foreground"
                >
                  3 agents actifs
                </Badge>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Options du canal">
            <EllipsisIcon />
          </Button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-7 lg:px-10">
        <div className="flex-1 py-6 sm:py-8">
          <div className="space-y-1">
            {messages.map((message) => (
              <article
                key={message.id}
                className="group -mx-3 flex gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-card/70"
              >
                <Avatar className="mt-0.5 size-9 shrink-0 rounded-xl">
                  <AvatarFallback
                    className={`rounded-xl text-[0.66rem] font-semibold ${message.tone}`}
                  >
                    {message.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-baseline gap-2">
                    <p className="text-sm font-semibold">{message.author}</p>
                    {message.agent ? (
                      <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[0.58rem] font-medium text-muted-foreground uppercase">
                        <BotIcon className="size-2.5" /> Agent
                      </span>
                    ) : null}
                    <span className="text-[0.68rem] text-muted-foreground">
                      {message.role} · {message.time}
                    </span>
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-foreground/82">{message.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 bg-background/92 pt-3 pb-5 backdrop-blur-xl">
          <form
            onSubmit={submit}
            className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg/5 focus-within:border-ring/60 focus-within:ring-3 focus-within:ring-ring/10"
          >
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Écrire à l’équipe noyau…"
              rows={2}
              className="min-h-20 resize-none rounded-none border-0 bg-transparent px-4 pt-4 text-sm shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <div className="flex items-center gap-1 border-t border-border/60 px-2 py-2">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Joindre un artefact">
                <PaperclipIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Mentionner un membre"
              >
                <AtSignIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Commande Marion">
                <SparkleIcon />
              </Button>
              <span className="ml-1 text-[0.65rem] text-muted-foreground">
                Entrée pour envoyer · Maj + Entrée pour une ligne
              </span>
              <Button
                type="submit"
                size="icon-sm"
                disabled={draft.trim() === ""}
                aria-label="Envoyer"
                className="ml-auto rounded-lg"
              >
                <SendIcon />
              </Button>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}
