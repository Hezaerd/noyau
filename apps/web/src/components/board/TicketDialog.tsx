import type { TicketPriority } from "@noyau/protocol/entities/ticket"
import { format, isValid, parseISO } from "date-fns"
import {
  ActivityIcon,
  BotIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  GitBranchIcon,
  MessageCircleIcon,
  PlayIcon,
  SendIcon,
  SquareArrowOutUpRightIcon,
} from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverClose, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  isTicketPriority,
  priorities,
  type BoardActor,
  type BoardTicket,
  type BoardTicketPatch,
} from "@/lib/board-model"

const priorityLabels = {
  none: "Aucune",
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
} satisfies Record<TicketPriority, string>

const priorityDots = {
  none: "bg-muted-foreground",
  low: "bg-info",
  normal: "bg-primary",
  high: "bg-warning",
  urgent: "bg-destructive",
} satisfies Record<TicketPriority, string>

const parseTicketDueDate = (dueAt: string | undefined): Date | undefined => {
  if (dueAt === undefined) {
    return undefined
  }

  const date = parseISO(dueAt.slice(0, 10))
  return isValid(date) ? date : undefined
}

interface TicketDialogProps {
  readonly ticket: BoardTicket | undefined
  readonly actors: ReadonlyArray<BoardActor>
  readonly focusTitle: boolean
  readonly onClose: () => void
  readonly onTitleFocusComplete: () => void
  readonly onUpdate: (ticketId: string, patch: BoardTicketPatch) => void
  readonly onToggleChecklist: (ticketId: string, itemId: string) => void
  readonly onStartExecution: (
    ticketId: string,
    input: { readonly profileId: string; readonly profileName: string; readonly outcome: string },
  ) => void
  readonly onReply: (ticketId: string, message: string) => void
}

interface ExecutionDialogProps {
  readonly ticket: BoardTicket
  readonly actors: ReadonlyArray<BoardActor>
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onStart: (input: {
    readonly profileId: string
    readonly profileName: string
    readonly outcome: string
  }) => void
}

function ExecutionDialog({ ticket, actors, open, onOpenChange, onStart }: ExecutionDialogProps) {
  const agentProfiles = actors.filter((actor) => actor.kind === "agent")
  const agentOptions = agentProfiles.flatMap((actor) =>
    actor.profileId === undefined
      ? []
      : [{ value: actor.profileId, label: `${actor.name} · ${actor.role}` }],
  )
  const [profileId, setProfileId] = useState(agentOptions[0]?.value ?? "")
  const [outcome, setOutcome] = useState("")

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const profile = agentProfiles.find((actor) => actor.profileId === profileId)
    if (outcome.trim() === "" || profile === undefined || profile.profileId === undefined) {
      return
    }
    onStart({
      profileId: profile.profileId,
      profileName: profile.name,
      outcome: outcome.trim(),
    })
    setOutcome("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
            <PlayIcon className="size-4" />
          </div>
          <DialogTitle>Lancer une exécution</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="contents">
          <DialogPanel>
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="execution-profile">Profil d’agent</Label>
                <Select
                  items={agentOptions}
                  value={profileId}
                  onValueChange={(value) => setProfileId(value ?? "")}
                >
                  <SelectTrigger id="execution-profile" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectGroup>
                      <SelectGroupLabel>Agents</SelectGroupLabel>
                      {agentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectPopup>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-muted/35 p-3">
                  <p className="text-xs font-medium">Budget hérité</p>
                  <p className="mt-2 text-xs">45 min · 180k tokens</p>
                </div>
                <div className="rounded-xl border bg-muted/35 p-3">
                  <p className="text-xs font-medium">Outils</p>
                  <p className="mt-2 text-xs">Branche + tests · sans publication</p>
                </div>
              </div>
              <details className="group rounded-xl border px-3 py-2.5">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium">
                  <ChevronDownIcon className="size-3.5 text-muted-foreground group-open:rotate-180" />
                  Paramètres avancés
                </summary>
                <p className="mt-3 pl-5 text-xs leading-relaxed text-muted-foreground">
                  Timeout 45 min · autonomie niveau 2 · arrêt sur demande humaine.
                </p>
              </details>
            </div>
          </DialogPanel>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>Annuler</DialogClose>
            <Button type="submit" disabled={outcome.trim() === "" || profileId === ""}>
              <PlayIcon />
              Lancer une exécution
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}

export function TicketDialog({
  ticket,
  actors,
  focusTitle,
  onClose,
  onTitleFocusComplete,
  onUpdate,
  onToggleChecklist,
  onStartExecution,
  onReply,
}: TicketDialogProps) {
  const [title, setTitle] = useState(ticket?.title ?? "")
  const [description, setDescription] = useState(ticket?.description ?? "")
  const [editingDescription, setEditingDescription] = useState(false)
  const [executionOpen, setExecutionOpen] = useState(false)
  const [reply, setReply] = useState("")
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(ticket?.title ?? "")
    setDescription(ticket?.description ?? "")
    setEditingDescription(false)
    setDueDateOpen(false)
  }, [ticket])

  useEffect(() => {
    if (!focusTitle || ticket === undefined) {
      return
    }
    const frame = requestAnimationFrame(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
      onTitleFocusComplete()
    })
    return () => cancelAnimationFrame(frame)
  }, [focusTitle, onTitleFocusComplete, ticket])

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
  const humanAssigneeOptions = actors
    .filter((actor) => actor.kind === "human")
    .map((actor) => ({ value: actor.id, label: actor.name }))
  const agentAssigneeOptions = actors
    .filter((actor) => actor.kind === "agent")
    .map((actor) => ({ value: actor.id, label: actor.name }))
  const assigneeOptions = [
    { value: "unassigned", label: "Non assigné" },
    ...humanAssigneeOptions,
    ...agentAssigneeOptions,
  ]
  const priorityOptions = priorities.map((priority) => ({
    value: priority,
    label: priorityLabels[priority],
  }))
  const dueDate = parseTicketDueDate(ticket?.dueAt)

  const updateDueDate = (date: Date | undefined) => {
    if (ticket === undefined) {
      return
    }

    onUpdate(ticket.id, {
      dueAt: date === undefined ? undefined : `${format(date, "yyyy-MM-dd")}T17:00:00.000Z`,
    })
    setDueDateOpen(false)
  }

  return (
    <>
      <Dialog
        open={ticket !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            onClose()
          }
        }}
      >
        <DialogPopup
          bottomStickOnMobile={false}
          className="gap-0 p-0 sm:max-h-[min(52rem,calc(100dvh-2rem))] sm:max-w-4xl"
        >
          {ticket === undefined ? null : (
            <>
              <DialogHeader className="border-b px-6 py-5 pr-14">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full text-[0.62rem]">
                    NOY-{ticket.id.replace("ticket-", "").slice(0, 4).toLocaleUpperCase("fr")}
                  </Badge>
                  {ticket.attention === undefined ? null : (
                    <Badge className="rounded-full bg-warning/12 text-[0.62rem] text-warning-foreground">
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
                <DialogTitle
                  render={
                    <Input
                      ref={titleInputRef}
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
                  }
                />
                <DialogDescription>
                  Modifie les détails sans quitter le contexte du Tableau.
                </DialogDescription>
              </DialogHeader>

              <DialogPanel className="p-0">
                <div className="space-y-8 px-6 py-6">
                  <section aria-labelledby="ticket-details-title">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 id="ticket-details-title" className="text-sm font-medium">
                        Détails
                      </h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-[0.68rem] text-muted-foreground">Responsable</Label>
                        <Select
                          items={assigneeOptions}
                          value={ticket.assigneeId ?? "unassigned"}
                          onValueChange={(value) =>
                            onUpdate(ticket.id, {
                              assigneeId:
                                value === null || value === "unassigned" ? undefined : value,
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue>
                              {assignee === undefined ? "Non assigné" : assignee.name}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectPopup>
                            <SelectItem value="unassigned">Non assigné</SelectItem>
                            <SelectGroup>
                              <SelectGroupLabel>Humains</SelectGroupLabel>
                              {humanAssigneeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                            <SelectGroup>
                              <SelectGroupLabel>Agents</SelectGroupLabel>
                              {agentAssigneeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectPopup>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[0.68rem] text-muted-foreground">Priorité</Label>
                        <Select
                          items={priorityOptions}
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
                          <SelectPopup>
                            {priorityOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <span
                                  className={`size-2 rounded-full ${priorityDots[option.value]}`}
                                />
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label
                          htmlFor="ticket-due-at"
                          className="text-[0.68rem] text-muted-foreground"
                        >
                          Échéance
                        </Label>
                        <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                          <PopoverTrigger
                            id="ticket-due-at"
                            aria-label="Sélectionner une échéance"
                            render={
                              <Button
                                className="w-full justify-start text-left font-normal"
                                variant="outline"
                              />
                            }
                          >
                            <CalendarIcon aria-hidden="true" />
                            {dueDate === undefined ? (
                              <span className="text-muted-foreground">Aucune date</span>
                            ) : (
                              format(dueDate, "dd/MM/yyyy")
                            )}
                          </PopoverTrigger>
                          <PopoverPopup align="start" className="w-auto p-0">
                            <div className="flex items-center justify-between border-b px-3 py-2">
                              <span className="text-xs font-medium">Échéance</span>
                              <PopoverClose
                                disabled={dueDate === undefined}
                                onClick={() => updateDueDate(undefined)}
                                render={
                                  <Button size="xs" variant="ghost">
                                    Effacer
                                  </Button>
                                }
                              />
                            </div>
                            <Calendar
                              mode="single"
                              onSelect={updateDueDate}
                              {...(dueDate === undefined
                                ? {}
                                : { defaultMonth: dueDate, selected: dueDate })}
                            />
                          </PopoverPopup>
                        </Popover>
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
                        <h3 id="ticket-checklist-title" className="text-sm font-medium">
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
                              <CheckCircleIcon className="size-4 shrink-0 text-success" />
                            ) : (
                              <CircleIcon className="size-4 shrink-0 text-muted-foreground" />
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
                    <h3 id="ticket-dependencies-title" className="mb-3 text-sm font-medium">
                      Dépendances
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border p-3">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <GitBranchIcon className="size-3.5 text-muted-foreground" />
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
                          <GitBranchIcon className="size-3.5 rotate-180 text-muted-foreground" />
                          Bloque
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">Aucun ticket</p>
                      </div>
                    </div>
                  </section>

                  <section aria-labelledby="ticket-executions-title">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 id="ticket-executions-title" className="text-sm font-medium">
                          Exécutions
                        </h3>
                      </div>
                      <Button size="sm" onClick={() => setExecutionOpen(true)}>
                        <PlayIcon />
                        Lancer une exécution
                      </Button>
                    </div>
                    {ticket.execution === undefined ? (
                      <div className="rounded-xl border border-dashed px-4 py-5 text-center">
                        <BotIcon className="mx-auto mb-2 size-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          Aucune exécution pour ce ticket
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-muted/25 p-4">
                        <div className="flex items-center gap-3">
                          <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
                            <span className="relative inline-flex size-2 rounded-full bg-primary" />
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
                        <h3 id="ticket-workbench-title" className="text-sm font-medium">
                          Workbench
                        </h3>
                      </div>
                      <Button variant="ghost" size="xs">
                        Ouvrir dans le Channel
                        <SquareArrowOutUpRightIcon />
                      </Button>
                    </div>
                    <div className="overflow-hidden rounded-xl border">
                      <div className="max-h-64 space-y-4 overflow-y-auto p-4">
                        {ticket.messages.length === 0 ? (
                          <div className="py-5 text-center">
                            <MessageCircleIcon className="mx-auto mb-2 size-4 text-muted-foreground" />
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
                          <SendIcon />
                        </Button>
                      </form>
                    </div>
                  </section>

                  <details className="group border-t pt-5" open={ticket.attention === "failure"}>
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                      <ChevronDownIcon className="size-3.5 group-open:rotate-180" />
                      Activité système
                      <span className="ml-auto font-normal tracking-normal normal-case">
                        {ticket.activity.length}
                      </span>
                    </summary>
                    <div className="mt-4 space-y-4 pl-1">
                      {ticket.activity.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Aucune activité enregistrée.
                        </p>
                      ) : (
                        ticket.activity.map((item) => (
                          <div key={item.id} className="flex gap-3">
                            <div className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-muted">
                              <ActivityIcon className="size-3 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="text-xs">
                                <span className="font-medium">{item.actor}</span> {item.action}
                              </p>
                              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                                {item.at}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                </div>
              </DialogPanel>
            </>
          )}
        </DialogPopup>
      </Dialog>

      {ticket === undefined ? null : (
        <ExecutionDialog
          ticket={ticket}
          actors={actors}
          open={executionOpen}
          onOpenChange={setExecutionOpen}
          onStart={(input) => onStartExecution(ticket.id, input)}
        />
      )}
    </>
  )
}
