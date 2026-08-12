import type { ProjectTaskSnapshot } from "@noyau/protocol/control-plane"
import type { Task, TaskStatus } from "@noyau/protocol/entities/task"
import type { TaskRejection } from "@noyau/protocol/receipts"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Plus,
  RefreshCw,
  Target,
  UserPlus,
  X,
} from "lucide-react"
import { useCallback, useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { createTask, loadTaskSnapshot, selfAssignTask } from "@/lib/control-plane"

const statusLabels = {
  proposed: "Proposée",
  ready: "Prête",
  leased: "Réservée",
  running: "En cours",
  waiting_human: "Attend une réponse",
  waiting_agent: "Attend un agent",
  verifying: "En vérification",
  completed: "Terminée",
  failed: "Échouée",
  cancelled: "Annulée",
} satisfies Record<TaskStatus, string>

const rejectionMessage = (rejection: TaskRejection): string => {
  switch (rejection._tag) {
    case "TaskAlreadyAssigned":
      return "Cette tâche est déjà attribuée."
    case "TaskAlreadyExists":
      return "Une tâche portant cet identifiant existe déjà."
    case "TaskNotFound":
      return "Cette tâche n'existe plus dans le snapshot courant."
    case "InvalidTaskTransition":
      return "Cette action n'est pas permise dans l'état courant de la tâche."
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
  readonly disabled: boolean
  readonly onCreated: (snapshot: ProjectTaskSnapshot) => void
  readonly onFeedback: (feedback: Feedback) => void
}

function TaskComposer({ disabled, onCreated, onFeedback }: TaskComposerProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [criteria, setCriteria] = useState<ReadonlyArray<CriterionField>>([{ id: 0, value: "" }])
  const [showDetails, setShowDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canSubmit =
    title.trim() !== "" && criteria.some((criterion) => criterion.value.trim() !== "")

  const updateCriterion = (id: number, value: string) => {
    setCriteria((current) =>
      current.map((criterion) => (criterion.id === id ? { ...criterion, value } : criterion)),
    )
  }

  const removeCriterion = (id: number) => {
    setCriteria((current) => current.filter((criterion) => criterion.id !== id))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || submitting) {
      return
    }

    setSubmitting(true)
    onFeedback({ tone: "success", message: "" })

    const commandResult = await createTask({
      title,
      description,
      acceptanceCriteria: criteria.map((criterion) => criterion.value),
    })

    if (!commandResult.ok) {
      onFeedback({
        tone: "error",
        message: "La création n'a pas atteint le control plane.",
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
        message: "La tâche est créée, mais le snapshot n'a pas pu être relu.",
        details: snapshotResult.details,
      })
      setSubmitting(false)
      return
    }

    setTitle("")
    setDescription("")
    setCriteria([{ id: 0, value: "" }])
    setShowDetails(false)
    onCreated(snapshotResult.value)
    onFeedback({ tone: "success", message: "Tâche créée et snapshot synchronisé." })
    setSubmitting(false)
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-2xl border border-border bg-card p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-accent uppercase">
            Nouvelle tâche
          </p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.02em] text-primary">
            Définir le prochain résultat
          </h2>
        </div>
        <Target aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>

      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-foreground">Objectif</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex. Brancher le snapshot des tâches"
            className="h-12 rounded-xl border border-input bg-background px-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <div className="grid gap-2">
          <span className="text-sm font-medium text-foreground">Critère d'acceptation</span>
          {criteria.map((criterion, index) => (
            <div key={criterion.id} className="flex gap-2">
              <input
                value={criterion.value}
                onChange={(event) => updateCriterion(criterion.id, event.target.value)}
                placeholder={
                  index === 0
                    ? "Ex. Le snapshot réel est affiché sans donnée fictive"
                    : "Autre critère"
                }
                className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              {criteria.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Supprimer le critère ${index + 1}`}
                  onClick={() => removeCriterion(criterion.id)}
                  className="h-12 w-12 shrink-0 text-muted-foreground hover:text-primary"
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>

        {showDetails ? (
          <div className="grid gap-4 border-t border-border pt-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Description optionnelle</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Contexte utile, sans répéter le critère de réussite."
                className="resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setCriteria((current) => [
                  ...current,
                  { id: (current.at(-1)?.id ?? -1) + 1, value: "" },
                ])
              }
              className="w-fit"
            >
              <Plus aria-hidden="true" className="size-4" />
              Ajouter un critère
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowDetails((current) => !current)}
            className="justify-start text-muted-foreground"
          >
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform ${showDetails ? "rotate-180" : ""}`}
            />
            {showDetails ? "Masquer les détails" : "Description et autres critères"}
          </Button>
          <Button
            type="submit"
            disabled={disabled || submitting || !canSubmit}
            className="h-11 sm:px-5"
          >
            {submitting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Plus aria-hidden="true" className="size-4" />
            )}
            Créer la tâche
          </Button>
        </div>
      </div>
    </form>
  )
}

interface TaskItemProps {
  readonly task: Task
  readonly assigning: boolean
  readonly onAssign: (task: Task) => void
}

function TaskItem({ task, assigning, onAssign }: TaskItemProps) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {statusLabels[task.status]}
            </span>
            <span className="font-mono text-[0.68rem] text-subtle">{task.id.slice(0, 8)}</span>
          </div>
          <h3 className="text-lg font-medium tracking-[-0.02em] text-primary">{task.title}</h3>
          {task.description === undefined ? null : (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>

        {task.assigneeId === undefined ? (
          <Button
            type="button"
            variant="outline"
            disabled={assigning}
            onClick={() => onAssign(task)}
            className="h-10 shrink-0"
          >
            {assigning ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <UserPlus aria-hidden="true" className="size-4" />
            )}
            M'attribuer
          </Button>
        ) : (
          <div className="flex shrink-0 items-center gap-2 rounded-full bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            {task.assigneeId}
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-subtle uppercase">
          Critères d'acceptation
        </p>
        <ul className="grid gap-2">
          {task.acceptanceCriteria.map((criterion) => (
            <li
              key={criterion}
              className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
            >
              <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-accent" />
              {criterion}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

export function TasksPage() {
  const [snapshot, setSnapshot] = useState<ProjectTaskSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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
        message: "L'assignation n'a pas atteint le control plane.",
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
      setFeedback({ tone: "success", message: "Assignation enregistrée et snapshot synchronisé." })
    } else {
      setFeedback({
        tone: "error",
        message: "L'assignation est enregistrée, mais le snapshot n'a pas pu être relu.",
        details: snapshotResult.details,
      })
    }
    setAssigningTaskId(null)
  }

  const taskCount = snapshot?.tasks.length ?? 0

  return (
    <section className="mx-auto w-full max-w-5xl py-8 sm:py-12 lg:py-16">
      <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">
            Mission sandbox
          </p>
          <h1 className="mt-2 text-[clamp(2.25rem,6vw,4.5rem)] leading-[0.94] font-normal tracking-[-0.06em] text-primary">
            Ce qui doit avancer.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Une vue réelle du snapshot Noyau. Chaque commande est persistée avant d'apparaître ici.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-muted-foreground">
            {taskCount} tâche{taskCount === 1 ? "" : "s"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Rafraîchir le snapshot"
            disabled={loading || refreshing}
            onClick={() => void refresh()}
            className="size-9"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </header>

      <TaskComposer
        disabled={loading}
        onCreated={setSnapshot}
        onFeedback={(nextFeedback) =>
          setFeedback(nextFeedback.message === "" ? null : nextFeedback)
        }
      />

      {feedback === null ? null : (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={`mt-5 rounded-xl border px-4 py-3 ${
            feedback.tone === "error"
              ? "border-destructive/40 bg-destructive/10 text-foreground"
              : "border-accent/30 bg-accent/10 text-foreground"
          }`}
        >
          <div className="flex gap-3">
            {feedback.tone === "error" ? (
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{feedback.message}</p>
              {feedback.details === undefined ? null : (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Détails techniques</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap">{feedback.details}</pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-2xl border border-dashed border-border">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-accent" />
              Lecture du snapshot…
            </div>
          </div>
        ) : snapshot?.tasks.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 text-center">
            <Target aria-hidden="true" className="mb-4 size-6 text-accent" />
            <h2 className="text-lg font-medium text-primary">Aucune tâche dans cette mission</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              Définis un résultat et son critère de réussite. Il sera écrit dans le journal
              d'événements Noyau.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {snapshot?.tasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                assigning={assigningTaskId === task.id}
                onAssign={(selectedTask) => void assign(selectedTask)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
