import type { TicketPriority } from "@noyau/protocol/entities/ticket"
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  ExternalLink,
  GitBranch,
  MessageSquareText,
  Play,
  Send,
  Sparkles,
} from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  isTicketPriority,
  priorities,
  type BoardActor,
  type BoardTicket,
  type BoardTicketPatch,
} from "@/lib/board-model"

const priorityLabels: Record<TicketPriority, string> = {
  none: "Aucune",
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
}

const priorityDots: Record<TicketPriority, string> = {
  none: "bg-zinc-500",
  low: "bg-sky-400",
  normal: "bg-violet-400",
  high: "bg-amber-400",
  urgent: "bg-rose-400",
}

interface TicketSheetProps {
  readonly ticket: BoardTicket | undefined
  readonly actors: ReadonlyArray<BoardActor>
  readonly onClose: () => void
  readonly onUpdate: (ticketId: string, patch: BoardTicketPatch) => void
  readonly onToggleChecklist: (ticketId: string, itemId: string) => void
  readonly onStartExecution: (ticketId: string, profile: string) => void
  readonly onReply: (ticketId: string, message: string) => void
}

interface ExecutionDialogProps {
  readonly ticket: BoardTicket
  readonly actors: ReadonlyArray<BoardActor>
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onStart: (profile: string) => void
}

function ExecutionDialog({ ticket, actors, open, onOpenChange, onStart }: ExecutionDialogProps) {
  const agentProfiles = actors.filter((actor) => actor.kind === "agent")
  const [profile, setProfile] = useState(agentProfiles[0]?.name ?? "")
  const [outcome, setOutcome] = useState("")

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (outcome.trim() === "" || profile === "") {
      return
    }
    onStart(profile)
    setOutcome("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
              <Play className="size-4" />
            </div>
            <DialogTitle>Lancer une exécution</DialogTitle>
            <DialogDescription>
              L’assignation reste indépendante. Cette exécution reçoit un résultat, un budget et une
              politique d’outils explicites.
            </DialogDescription>
          </DialogHeader>

          <div className="my-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="execution-outcome">Résultat attendu</Label>
              <Textarea
                id="execution-outcome"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                placeholder={`Ex. ${ticket.title} est vérifié par les tests de l’interface.`}
                rows={3}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="execution-profile">Profil d’agent</Label>
              <Select value={profile} onValueChange={(value) => setProfile(value ?? "")}>
                <SelectTrigger id="execution-profile" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Agents</SelectLabel>
                    {agentProfiles.map((actor) => (
                      <SelectItem key={actor.id} value={actor.name}>
                        {actor.name} · {actor.role}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/35 p-3">
                <p className="text-[0.65rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                  Budget hérité
                </p>
                <p className="mt-2 text-xs">45 min · 180k tokens</p>
              </div>
              <div className="rounded-xl border bg-muted/35 p-3">
                <p className="text-[0.65rem] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                  Outils
                </p>
                <p className="mt-2 text-xs">Branche + tests · sans publication</p>
              </div>
            </div>
            <details className="group rounded-xl border px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium">
                <ChevronDown className="size-3.5 text-muted-foreground group-open:rotate-180" />
                Paramètres avancés
              </summary>
              <p className="mt-3 pl-5 text-xs leading-relaxed text-muted-foreground">
                Timeout 45 min · autonomie niveau 2 · arrêt sur demande humaine.
              </p>
            </details>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={outcome.trim() === "" || profile === ""}>
              <Play />
              Lancer une exécution
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TicketSheet({
  ticket,
  actors,
  onClose,
  onUpdate,
  onToggleChecklist,
  onStartExecution,
  onReply,
}: TicketSheetProps) {
  const [title, setTitle] = useState(ticket?.title ?? "")
  const [description, setDescription] = useState(ticket?.description ?? "")
  const [editingDescription, setEditingDescription] = useState(false)
  const [executionOpen, setExecutionOpen] = useState(false)
  const [reply, setReply] = useState("")

  useEffect(() => {
    setTitle(ticket?.title ?? "")
    setDescription(ticket?.description ?? "")
    setEditingDescription(false)
  }, [ticket])

  const saveTitle = () => {
    if (ticket !== undefined && title.trim() !== "" && title.trim() !== ticket.title) {
      onUpdate(ticket.id, { title: title.trim() })
    }
  }

  const saveDescription = () => {
    if (ticket !== undefined && description !== ticket.description) {
      onUpdate(ticket.id, { description })
    }
    setEditingDescription(false)
  }

  const sendReply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (ticket === undefined || reply.trim() === "") {
      return
    }
    onReply(ticket.id, reply)
    setReply("")
  }

  const assignee = actors.find((actor) => actor.id === ticket?.assigneeId)
  const completedChecklist = ticket?.checklist.filter((item) => item.done).length ?? 0

  return (
    <>
      <Sheet
        open={ticket !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            onClose()
          }
        }}
      >
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
          {ticket === undefined ? null : (
            <>
              <SheetHeader className="border-b px-6 py-5 pr-14">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full text-[0.62rem]">
                    NOY-{ticket.id.replace("ticket-", "").slice(0, 4).toLocaleUpperCase("fr")}
                  </Badge>
                  {ticket.attention === undefined ? null : (
                    <Badge className="rounded-full bg-amber-500/12 text-[0.62rem] text-amber-300">
                      {ticket.attention === "blocked"
                        ? "Bloqué"
                        : ticket.attention === "question"
                          ? "Question"
                          : ticket.attention === "approval"
                            ? "Approbation"
                            : "Échec"}
                    </Badge>
                  )}
                </div>
                <SheetTitle asChild>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur()
                      }
                    }}
                    className="-ml-2 h-auto border-transparent bg-transparent px-2 py-1 text-xl font-semibold tracking-[-0.03em] shadow-none focus-visible:border-input"
                    aria-label="Titre du ticket"
                  />
                </SheetTitle>
                <SheetDescription>
                  Modifie les détails sans quitter le contexte du Tableau.
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-8 px-6 py-6">
                <section aria-labelledby="ticket-details-title">
                  <div className="mb-4 flex items-center justify-between">
                    <h3
                      id="ticket-details-title"
                      className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                    >
                      Détails
                    </h3>
                    <span className="text-[0.65rem] text-muted-foreground">
                      Sauvegarde immédiate
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className="text-[0.68rem] text-muted-foreground">Responsable</Label>
                      <Select
                        value={ticket.assigneeId ?? "unassigned"}
                        onValueChange={(value) =>
                          onUpdate(ticket.id, {
                            assigneeId: value === "unassigned" ? undefined : value,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {assignee === undefined ? "Non assigné" : assignee.name}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Non assigné</SelectItem>
                          <SelectGroup>
                            <SelectLabel>Humains</SelectLabel>
                            {actors
                              .filter((actor) => actor.kind === "human")
                              .map((actor) => (
                                <SelectItem key={actor.id} value={actor.id}>
                                  {actor.name}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel>Agents</SelectLabel>
                            {actors
                              .filter((actor) => actor.kind === "agent")
                              .map((actor) => (
                                <SelectItem key={actor.id} value={actor.id}>
                                  {actor.name}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[0.68rem] text-muted-foreground">Priorité</Label>
                      <Select
                        value={ticket.priority}
                        onValueChange={(value) => {
                          if (value !== null && isTicketPriority(value)) {
                            onUpdate(ticket.id, { priority: value })
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            <span
                              className={`size-2 rounded-full ${priorityDots[ticket.priority]}`}
                            />
                            {priorityLabels[ticket.priority]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {priorities.map((priority) => (
                            <SelectItem key={priority} value={priority}>
                              <span className={`size-2 rounded-full ${priorityDots[priority]}`} />
                              {priorityLabels[priority]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="ticket-due-at"
                        className="text-[0.68rem] text-muted-foreground"
                      >
                        Échéance
                      </Label>
                      <Input
                        id="ticket-due-at"
                        type="date"
                        value={ticket.dueAt?.slice(0, 10) ?? ""}
                        onChange={(event) =>
                          onUpdate(ticket.id, {
                            dueAt:
                              event.target.value === ""
                                ? undefined
                                : `${event.target.value}T17:00:00.000Z`,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Description</Label>
                      {editingDescription ? null : (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setEditingDescription(true)}
                        >
                          Modifier
                        </Button>
                      )}
                    </div>
                    {editingDescription ? (
                      <div className="space-y-2">
                        <Textarea
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                              saveDescription()
                            }
                          }}
                          rows={5}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <span className="mr-auto text-[0.65rem] text-muted-foreground">
                            Markdown · ⌘/Ctrl + Entrée
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingDescription(false)}
                          >
                            Annuler
                          </Button>
                          <Button size="sm" onClick={saveDescription}>
                            Enregistrer
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="w-full rounded-xl border border-transparent bg-muted/35 px-4 py-3 text-left text-sm leading-relaxed text-muted-foreground hover:border-border"
                        onClick={() => setEditingDescription(true)}
                      >
                        {ticket.description === ""
                          ? "Ajouter une description…"
                          : ticket.description}
                      </button>
                    )}
                  </div>

                  {ticket.labels.length === 0 ? null : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {ticket.labels.map((label) => (
                        <Badge key={label} variant="secondary" className="rounded-full">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </section>

                {ticket.checklist.length === 0 ? null : (
                  <section aria-labelledby="ticket-checklist-title">
                    <div className="mb-3 flex items-center justify-between">
                      <h3
                        id="ticket-checklist-title"
                        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                      >
                        Checklist
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {completedChecklist}/{ticket.checklist.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {ticket.checklist.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onToggleChecklist(ticket.id, item.id)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/45"
                        >
                          {item.done ? (
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                          ) : (
                            <Circle className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <span className={item.done ? "text-muted-foreground line-through" : ""}>
                            {item.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section aria-labelledby="ticket-dependencies-title">
                  <h3
                    id="ticket-dependencies-title"
                    className="mb-3 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                  >
                    Dépendances
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <GitBranch className="size-3.5 text-muted-foreground" />
                        Bloqué par
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {ticket.blockedBy.length === 0
                          ? "Aucun prérequis ouvert"
                          : `${ticket.blockedBy.length} ticket ouvert`}
                      </p>
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <GitBranch className="size-3.5 rotate-180 text-muted-foreground" />
                        Bloque
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Aucun ticket</p>
                    </div>
                  </div>
                </section>

                <section aria-labelledby="ticket-executions-title">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3
                        id="ticket-executions-title"
                        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                      >
                        Exécutions
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Assigner un agent ne lance rien.
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setExecutionOpen(true)}>
                      <Play />
                      Lancer une exécution
                    </Button>
                  </div>
                  {ticket.execution === undefined ? (
                    <div className="rounded-xl border border-dashed px-4 py-5 text-center">
                      <Bot className="mx-auto mb-2 size-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        Aucune exécution pour ce ticket
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-muted/25 p-4">
                      <div className="flex items-center gap-3">
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-400 opacity-40" />
                          <span className="relative inline-flex size-2 rounded-full bg-violet-400" />
                        </span>
                        <div>
                          <p className="text-sm font-medium">
                            {ticket.execution.count} exécution
                            {ticket.execution.count > 1 ? "s" : ""} ·{" "}
                            {ticket.execution.status === "waiting"
                              ? "Attend une réponse"
                              : ticket.execution.status === "verifying"
                                ? "Vérification"
                                : ticket.execution.status === "failed"
                                  ? "Échec"
                                  : "En cours"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {ticket.execution.profiles.join(", ")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <section aria-labelledby="ticket-workbench-title">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3
                        id="ticket-workbench-title"
                        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
                      >
                        Workbench
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">Thread dédié à ce Ticket</p>
                    </div>
                    <Button variant="ghost" size="xs">
                      Ouvrir dans le Channel
                      <ExternalLink />
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-xl border">
                    <div className="max-h-64 space-y-4 overflow-y-auto p-4">
                      {ticket.messages.length === 0 ? (
                        <div className="py-5 text-center">
                          <MessageSquareText className="mx-auto mb-2 size-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Commence la conversation de travail.
                          </p>
                        </div>
                      ) : (
                        ticket.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex gap-2.5 ${message.own === true ? "flex-row-reverse" : ""}`}
                          >
                            <Avatar className="size-7 rounded-lg">
                              <AvatarFallback className="rounded-lg bg-secondary text-[0.6rem]">
                                {message.initials}
                              </AvatarFallback>
                            </Avatar>
                            <div
                              className={`max-w-[82%] ${message.own === true ? "text-right" : ""}`}
                            >
                              <p className="mb-1 text-[0.64rem] text-muted-foreground">
                                {message.actor} · {message.at}
                              </p>
                              <p
                                className={`rounded-xl px-3 py-2 text-left text-xs leading-relaxed ${
                                  message.own === true
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                                }`}
                              >
                                {message.body}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <form onSubmit={sendReply} className="flex gap-2 border-t p-3">
                      <Input
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="Répondre dans le Workbench…"
                        aria-label="Répondre dans le Workbench"
                      />
                      <Button
                        type="submit"
                        size="icon"
                        disabled={reply.trim() === ""}
                        aria-label="Envoyer"
                      >
                        <Send />
                      </Button>
                    </form>
                  </div>
                </section>

                <details className="group border-t pt-5" open={ticket.attention === "failure"}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    <ChevronDown className="size-3.5 group-open:rotate-180" />
                    Activité système
                    <span className="ml-auto font-normal tracking-normal normal-case">
                      {ticket.activity.length}
                    </span>
                  </summary>
                  <div className="mt-4 space-y-4 pl-1">
                    {ticket.activity.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucune activité enregistrée.</p>
                    ) : (
                      ticket.activity.map((item) => (
                        <div key={item.id} className="flex gap-3">
                          <div className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                            <Activity className="size-3 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-xs">
                              <span className="font-medium">{item.actor}</span> {item.action}
                            </p>
                            <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{item.at}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              </div>

              <Separator />
              <div className="flex items-center gap-3 px-6 py-4 text-[0.68rem] text-muted-foreground">
                <CircleDot className="size-3.5" />
                Dernière synchronisation locale à l’instant
                <span className="ml-auto flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-violet-400" />
                  Interface de prévisualisation
                </span>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {ticket === undefined ? null : (
        <ExecutionDialog
          ticket={ticket}
          actors={actors}
          open={executionOpen}
          onOpenChange={setExecutionOpen}
          onStart={(profile) => onStartExecution(ticket.id, profile)}
        />
      )}
    </>
  )
}
