import type { ProjectTaskSnapshot } from "@noyau/protocol/control-plane"
import type { Task, TaskStatus } from "@noyau/protocol/entities/task"
import type { CommandRejection } from "@noyau/protocol/receipts"
import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  Check,
  CircleNotch,
  Clock,
  DotOutline,
  Plus,
  UserPlus,
  WarningCircle,
  X,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useState, type FormEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { createTask, loadTaskSnapshot, selfAssignTask } from "@/lib/control-plane"

const statusLabels = {
  proposed: "Proposée",
  ready: "Prête",
  leased: "Réservée",
  running: "En cours",
  waiting_human: "Décision requise",
  waiting_agent: "Attend un agent",
  verifying: "En revue",
  completed: "Terminée",
  failed: "Échouée",
  cancelled: "Annulée",
} satisfies Record<TaskStatus, string>

const statusStyles = {
  proposed: "border-border bg-muted/60 text-muted-foreground",
  ready: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  leased: "border-blue-500/25 bg-blue-500/10 text-blue-300",
  running: "border-primary/30 bg-primary/10 text-violet-300",
  waiting_human: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  waiting_agent: "border-sky-500/25 bg-sky-500/10 text-sky-300",
  verifying: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  completed: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  failed: "border-red-500/25 bg-red-500/10 text-red-300",
  cancelled: "border-zinc-500/25 bg-zinc-500/10 text-zinc-300",
} satisfies Record<TaskStatus, string>

const rejectionMessage = (rejection: CommandRejection): string => {
  switch (rejection._tag) {
    case "TaskAlreadyAssigned":
      return "Cette tâche est déjà attribuée."
    case "TaskAlreadyExists":
      return "Une tâche portant cet identifiant existe déjà."
    case "TaskNotFound":
      return "Cette tâche n’existe plus dans le snapshot courant."
    case "InvalidTaskTransition":
      return "Cette action n’est pas permise dans l’état courant de la tâche."
    default:
      return "La commande a été rejetée par le control plane."
  }
}

interface Feedback {
  readonly tone: "success" | "error"
  readonly message: string
  readonly details?: string
}

interface CriterionField {
  readonly id: number
  readonly value: string
}

interface TaskComposerProps {
  readonly open: boolean
  readonly disabled: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onCreated: (snapshot: ProjectTaskSnapshot) => void
  readonly onFeedback: (feedback: Feedback) => void
}

function TaskComposer({ open, disabled, onOpenChange, onCreated, onFeedback }: TaskComposerProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [criteria, setCriteria] = useState<ReadonlyArray<CriterionField>>([{ id: 0, value: "" }])
  const [submitting, setSubmitting] = useState(false)

  const canSubmit =
    title.trim() !== "" && criteria.some((criterion) => criterion.value.trim() !== "")

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || submitting) {
      return
    }

    setSubmitting(true)
    const commandResult = await createTask({
      title,
      description,
      acceptanceCriteria: criteria.map((criterion) => criterion.value),
    })

    if (!commandResult.ok) {
      onFeedback({
        tone: "error",
        message: "La création n’a pas atteint le control plane.",
        details: commandResult.details,
      })
      setSubmitting(false)
      return
    }

    if (commandResult.value.response._tag === "rejected") {
      onFeedback({
        tone: "error",
        message: rejectionMessage(commandResult.value.response.error),
      })
      setSubmitting(false)
      return
    }

    const snapshotResult = await loadTaskSnapshot()
    if (!snapshotResult.ok) {
      onFeedback({
        tone: "error",
        message: "La tâche est créée, mais le snapshot n’a pas pu être relu.",
        details: snapshotResult.details,
      })
      setSubmitting(false)
      return
    }

    setTitle("")
    setDescription("")
    setCriteria([{ id: 0, value: "" }])
    onCreated(snapshotResult.value)
    onFeedback({ tone: "success", message: "Tâche créée et snapshot synchronisé." })
    onOpenChange(false)
    setSubmitting(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <form onSubmit={(event) => void submit(event)} className="flex min-h-full flex-col">
          <SheetHeader className="border-b">
            <div className="mb-3 grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Plus className="size-4" />
            </div>
            <SheetTitle className="text-xl tracking-[-0.025em]">Nouvelle tâche</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-6 px-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="task-title">Objectif</Label>
              <Input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex. Reprendre le flux après reconnexion"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Contexte</Label>
              <Textarea
                id="task-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Contexte utile à l’agent, sans répéter le résultat attendu."
                rows={4}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Critères d’acceptation</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    setCriteria((current) => [
                      ...current,
                      { id: (current.at(-1)?.id ?? -1) + 1, value: "" },
                    ])
                  }
                >
                  <Plus />
                  Ajouter
                </Button>
              </div>
              {criteria.map((criterion, index) => (
                <div key={criterion.id} className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[0.65rem] font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <Input
                    value={criterion.value}
                    onChange={(event) =>
                      setCriteria((current) =>
                        current.map((item) =>
                          item.id === criterion.id ? { ...item, value: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Le comportement attendu est vérifiable"
                  />
                  {criteria.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Supprimer le critère ${index + 1}`}
                      onClick={() =>
                        setCriteria((current) => current.filter((item) => item.id !== criterion.id))
                      }
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <SheetFooter className="border-t sm:flex-row">
            <SheetClose
              render={
                <Button type="button" variant="outline">
                  Annuler
                </Button>
              }
            />
            <Button type="submit" disabled={disabled || submitting || !canSubmit}>
              {submitting ? <CircleNotch className="animate-spin" /> : <Plus />}
              Créer la tâche
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

interface TaskItemProps {
  readonly task: Task
  readonly assigning: boolean
  readonly onAssign: (task: Task) => void
}

function TaskItem({ task, assigning, onAssign }: TaskItemProps) {
  return (
    <article className="group rounded-2xl border border-border/85 bg-card px-4 py-4 shadow-xs transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-[0_14px_38px_rgba(53,38,122,0.16)] sm:px-5">
      <div className="flex items-start gap-3.5">
        <div
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border ${
            task.status === "completed"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-border bg-background text-muted-foreground"
          }`}
        >
          {task.status === "completed" ? (
            <Check className="size-3.5" />
          ) : (
            <DotOutline className="size-3" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={`rounded-full text-[0.62rem] ${statusStyles[task.status]}`}
                >
                  {statusLabels[task.status]}
                </Badge>
                <span className="font-mono text-[0.62rem] text-muted-foreground/65">
                  {task.id.slice(0, 8)}
                </span>
              </div>
              <h3 className="text-sm font-semibold tracking-[-0.015em] sm:text-[0.95rem]">
                {task.title}
              </h3>
              {task.description === undefined ? null : (
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {task.description}
                </p>
              )}
            </div>

            {task.assigneeId === undefined ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={assigning}
                onClick={() => onAssign(task)}
                className="w-fit shrink-0 rounded-full text-muted-foreground"
              >
                {assigning ? <CircleNotch className="animate-spin" /> : <UserPlus />}
                M’attribuer
              </Button>
            ) : (
              <div className="flex w-fit shrink-0 items-center gap-2 rounded-full bg-secondary px-2.5 py-1.5 text-[0.68rem] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-violet-400" />
                {task.assigneeId}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 pt-3">
            {task.acceptanceCriteria.slice(0, 2).map((criterion) => (
              <span
                key={criterion}
                className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground"
              >
                <CheckCircle className="size-3 text-violet-400" />
                {criterion}
              </span>
            ))}
            {task.acceptanceCriteria.length > 2 ? (
              <span className="text-[0.68rem] text-muted-foreground">
                +{task.acceptanceCriteria.length - 2}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

export function TasksPage() {
  const [snapshot, setSnapshot] = useState<ProjectTaskSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const refresh = useCallback(async (initial = false) => {
    if (initial) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }

    const result = await loadTaskSnapshot()
    if (result.ok) {
      setSnapshot(result.value)
      setFeedback(null)
    } else {
      setFeedback({
        tone: "error",
        message: "Impossible de charger le snapshot des tâches.",
        details: result.details,
      })
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void refresh(true)
  }, [refresh])

  const assign = async (task: Task) => {
    setAssigningTaskId(task.id)
    setFeedback(null)
    const commandResult = await selfAssignTask(task.id)

    if (!commandResult.ok) {
      setFeedback({
        tone: "error",
        message: "L’assignation n’a pas atteint le control plane.",
        details: commandResult.details,
      })
      setAssigningTaskId(null)
      return
    }

    if (commandResult.value.response._tag === "rejected") {
      setFeedback({
        tone: "error",
        message: rejectionMessage(commandResult.value.response.error),
      })
      setAssigningTaskId(null)
      return
    }

    const snapshotResult = await loadTaskSnapshot()
    if (snapshotResult.ok) {
      setSnapshot(snapshotResult.value)
      setFeedback({ tone: "success", message: "Assignation enregistrée." })
    } else {
      setFeedback({
        tone: "error",
        message: "L’assignation est enregistrée, mais le snapshot n’a pas pu être relu.",
        details: snapshotResult.details,
      })
    }
    setAssigningTaskId(null)
  }

  const tasks = snapshot?.tasks ?? []
  const completedCount = tasks.filter((task) => task.status === "completed").length
  const progress = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100)

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      <header className="mb-8 flex flex-col gap-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">
              Le travail qui compte.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Une vue compacte du snapshot réel. Les commandes restent persistées avant chaque mise
              à jour de l’interface.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Rafraîchir le snapshot"
              disabled={loading || refreshing}
              onClick={() => void refresh()}
              className="rounded-full bg-card"
            >
              <ArrowClockwise className={refreshing ? "animate-spin" : ""} />
            </Button>
            <Button className="rounded-full" onClick={() => setComposerOpen(true)}>
              <Plus />
              Nouvelle tâche
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex items-end justify-between">
              <span className="text-2xl font-semibold tracking-[-0.04em]">{progress}%</span>
              <span className="text-xs text-muted-foreground">
                {completedCount} / {tasks.length}
              </span>
            </div>
            <Progress value={progress} className="mt-3 h-1.5" />
          </div>
          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-violet-500" />
              <span className="text-2xl font-semibold tracking-[-0.04em]">
                {tasks.filter((task) => task.status === "running").length}
              </span>
              <span className="text-xs text-muted-foreground">tâches actives</span>
            </div>
          </div>
          <div className="rounded-2xl border border-violet-500/15 bg-[#15131d] p-4 text-foreground shadow-[0_14px_38px_rgba(68,48,150,0.14)]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Revoir les sorties agents</span>
              <ArrowRight className="size-4 text-violet-300" />
            </div>
          </div>
        </div>
      </header>

      {feedback === null ? null : (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={`mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.tone === "error"
              ? "border-destructive/25 bg-destructive/5"
              : "border-emerald-500/25 bg-emerald-500/10"
          }`}
        >
          {feedback.tone === "error" ? (
            <WarningCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-300" />
          )}
          <div>
            <p className="font-medium">{feedback.message}</p>
            {feedback.details === undefined ? null : (
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Détails techniques</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap">{feedback.details}</pre>
              </details>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Button variant="secondary" size="xs">
            Toutes <span className="text-muted-foreground">{tasks.length}</span>
          </Button>
          <Button variant="ghost" size="xs" className="text-muted-foreground">
            Actives
          </Button>
          <Button variant="ghost" size="xs" className="text-muted-foreground">
            Terminées
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-border">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <CircleNotch className="size-4 animate-spin" />
            Lecture du snapshot…
          </div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 text-center">
          <div className="mb-4 grid size-10 place-items-center rounded-xl bg-accent">
            <CheckCircle className="size-4 text-accent-foreground" />
          </div>
          <h3 className="text-sm font-semibold">Aucune tâche dans cette mission</h3>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            Crée un résultat borné. Il sera écrit dans le journal d’événements avant d’apparaître
            ici.
          </p>
          <Button size="sm" className="mt-5 rounded-full" onClick={() => setComposerOpen(true)}>
            <Plus />
            Créer la première tâche
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              assigning={assigningTaskId === task.id}
              onAssign={(selectedTask) => void assign(selectedTask)}
            />
          ))}
        </div>
      )}

      <TaskComposer
        open={composerOpen}
        disabled={loading}
        onOpenChange={setComposerOpen}
        onCreated={setSnapshot}
        onFeedback={setFeedback}
      />
    </main>
  )
}
