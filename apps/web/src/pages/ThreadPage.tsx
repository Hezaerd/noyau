import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { ApprovalRequestId, ProjectId, ThreadId, TicketId } from "@noyau/protocol/ids"
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type ClipboardEvent,
} from "react"

import { useControlPlane } from "@/components/control-plane-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  buildCommand,
  dispatchCommand,
  loadBoardSnapshot,
  loadThreadSnapshot,
  subscribeThread,
} from "@/lib/control-plane"
import {
  makeApprovalRespondRequest,
  makeThreadCreateRequest,
  makeThreadId,
  makeThreadRuntimeModeSetRequest,
  makeThreadTurnInterruptRequest,
  makeThreadTurnStartRequest,
  makeUserInputRespondRequest,
  runtimeModes,
  isRuntimeMode,
} from "@/lib/thread-commands"
import { makeTicketThreadLinkRequest, makeTicketThreadUnlinkRequest } from "@/lib/ticket-commands"

const interruptedLabel = "You stopped"

const transcriptLabel = (item: TranscriptItem): string => {
  switch (item._tag) {
    case "transcript.user":
      return "You"
    case "transcript.assistant":
      return "Cursor"
    case "transcript.tool":
      return item.name
    case "transcript.permission":
      return "Permission request"
    case "transcript.user-input":
      return "Question from Cursor"
    case "transcript.plan":
      return "Plan"
  }
}

interface ThreadPageProps {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly onCreated: (threadId: ThreadId) => void
}

export function ThreadPage({ projectId, threadId, onCreated }: ThreadPageProps) {
  const { projects } = useControlPlane()
  const project = projects.find((candidate) => candidate.id === projectId)
  const [snapshot, setSnapshot] = useState<ThreadSnapshot>()
  const [board, setBoard] = useState<BoardSnapshot>()
  const [loading, setLoading] = useState(threadId !== undefined)
  const [error, setError] = useState<string>()
  const [composerError, setComposerError] = useState<string>()
  const [text, setText] = useState("")
  const [runtimeMode, setRuntimeMode] =
    useState<(typeof runtimeModes)[number]["value"]>("full-access")
  const [answerByRequest, setAnswerByRequest] = useState<Record<string, string>>({})
  const [linkedTicketSelection, setLinkedTicketSelection] = useState<string | null>(null)

  const refreshThread = async () => {
    if (threadId === undefined) {
      setLoading(false)
      return
    }
    const result = await loadThreadSnapshot(threadId)
    if (!result.ok) {
      setError(result.details)
      setLoading(false)
      return
    }
    setSnapshot(result.value)
    setRuntimeMode(result.value.thread.runtimeMode)
    setError(undefined)
    setLoading(false)
  }

  const refreshBoard = async () => {
    const result = await loadBoardSnapshot(projectId)
    if (result.ok) {
      setBoard(result.value)
    }
  }

  useEffect(() => {
    void refreshBoard()
  }, [projectId])

  useEffect(() => {
    if (threadId === undefined) {
      setSnapshot(undefined)
      setLoading(false)
      return
    }
    setLoading(true)
    void refreshThread()
    return subscribeThread(threadId, undefined, {
      onSnapshot: (next) => {
        setSnapshot(next)
        setRuntimeMode(next.thread.runtimeMode)
        setLoading(false)
        setError(undefined)
      },
      onEvent: () => {
        void refreshThread()
        void refreshBoard()
      },
      onError: setError,
    })
  }, [threadId])

  const linkedTicketIds = useMemo(
    () =>
      threadId === undefined
        ? []
        : (board?.ticketThreads ?? [])
            .filter((ticketThread) => ticketThread.threadId === threadId)
            .map((ticketThread) => ticketThread.ticketId),
    [board?.ticketThreads, threadId],
  )
  const linkedTicketSet = new Set(linkedTicketIds)
  const linkableTickets = (board?.tickets ?? []).filter((ticket) => !linkedTicketSet.has(ticket.id))
  const activeTurn = snapshot?.session?.activeTurnId ?? snapshot?.thread.latestTurn?.turnId
  const isRunning =
    snapshot?.session?.status === "running" || snapshot?.thread.latestTurn?.state === "running"
  const isHumanInterrupted = snapshot?.thread.latestTurn?.state === "interrupted"
  const title = snapshot?.thread.title ?? "Nouveau Thread"

  const dispatch = async (
    request: Parameters<typeof dispatchCommand>[0],
    successMessage?: string,
  ) => {
    const result = await dispatchCommand(request)
    if (!result.ok) {
      setError(result.details)
      return false
    }
    if (successMessage !== undefined) {
      setComposerError(undefined)
    }
    return true
  }

  const submitTurn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const prompt = text.trim()
    if (prompt === "" || isRunning || project?.available !== true) {
      return
    }
    setText("")
    setComposerError(undefined)

    if (threadId === undefined) {
      const nextThreadId = await buildCommand(makeThreadId())
      if (!nextThreadId.ok) {
        setComposerError(nextThreadId.details)
        return
      }
      const createRequest = await buildCommand(
        makeThreadCreateRequest({
          threadId: nextThreadId.value,
          projectId,
          title: prompt,
          runtimeMode,
        }),
      )
      if (!createRequest.ok || !(await dispatch(createRequest.value))) {
        if (!createRequest.ok) {
          setComposerError(createRequest.details)
        }
        return
      }
      const startRequest = await buildCommand(
        makeThreadTurnStartRequest({
          threadId: nextThreadId.value,
          text: prompt,
          runtimeMode,
        }),
      )
      if (!startRequest.ok || !(await dispatch(startRequest.value))) {
        if (!startRequest.ok) {
          setComposerError(startRequest.details)
        }
        return
      }
      onCreated(nextThreadId.value)
      return
    }

    const startRequest = await buildCommand(
      makeThreadTurnStartRequest({ threadId, text: prompt, runtimeMode }),
    )
    if (!startRequest.ok) {
      setComposerError(startRequest.details)
      return
    }
    await dispatch(startRequest.value)
  }

  const interruptTurn = async () => {
    if (threadId === undefined) {
      return
    }
    const request = await buildCommand(
      makeThreadTurnInterruptRequest({
        threadId,
        ...(activeTurn === undefined ? {} : { turnId: activeTurn }),
      }),
    )
    if (!request.ok) {
      setError(request.details)
      return
    }
    await dispatch(request.value)
  }

  const selectRuntimeMode = async (value: string | null) => {
    if (value === null || !isRuntimeMode(value)) {
      return
    }
    setRuntimeMode(value)
    if (threadId === undefined) {
      return
    }
    const request = await buildCommand(
      makeThreadRuntimeModeSetRequest({ threadId, runtimeMode: value }),
    )
    if (!request.ok) {
      setError(request.details)
      return
    }
    await dispatch(request.value)
  }

  const rejectImages = (
    event: ClipboardEvent<HTMLTextAreaElement> | DragEvent<HTMLTextAreaElement>,
  ) => {
    const hasImage =
      "clipboardData" in event
        ? Array.from(event.clipboardData.items).some((item) => item.type.startsWith("image/"))
        : Array.from(event.dataTransfer.files).some((file) => file.type.startsWith("image/"))
    if (!hasImage) {
      return
    }
    event.preventDefault()
    setComposerError("Les images ne sont pas prises en charge dans les Threads v0.1.")
  }

  const respondToApproval = async (requestId: string, decision: "accept" | "decline") => {
    if (threadId === undefined) {
      return
    }
    const request = await buildCommand(
      makeApprovalRespondRequest({
        threadId,
        requestId: ApprovalRequestId.make(requestId),
        decision,
      }),
    )
    if (request.ok) {
      await dispatch(request.value)
    } else {
      setError(request.details)
    }
  }

  const respondToUserInput = async (requestId: string) => {
    if (threadId === undefined) {
      return
    }
    const answer = answerByRequest[requestId]?.trim()
    if (answer === undefined || answer === "") {
      return
    }
    const request = await buildCommand(
      makeUserInputRespondRequest({
        threadId,
        requestId: ApprovalRequestId.make(requestId),
        answer,
      }),
    )
    if (request.ok) {
      await dispatch(request.value)
    } else {
      setError(request.details)
    }
  }

  const linkTicket = async (ticketId: string | null) => {
    setLinkedTicketSelection(null)
    if (threadId === undefined || ticketId === null) {
      return
    }
    const request = await buildCommand(
      makeTicketThreadLinkRequest({ ticketId: TicketId.make(ticketId), threadId }),
    )
    if (request.ok) {
      await dispatch(request.value)
      await refreshBoard()
    } else {
      setError(request.details)
    }
  }

  const unlinkTicket = async (ticketId: TicketId) => {
    if (threadId === undefined) {
      return
    }
    const request = await buildCommand(makeTicketThreadUnlinkRequest({ ticketId, threadId }))
    if (request.ok) {
      await dispatch(request.value)
      await refreshBoard()
    } else {
      setError(request.details)
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="border-b border-border/65 bg-background/80 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.04em]">{title}</h1>
              <Badge variant="outline">{snapshot?.thread.provider ?? "cursor"}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {project?.name ?? "Project"} · Conversation Cursor durable
            </p>
          </div>
          <Select
            items={runtimeModes}
            value={runtimeMode}
            onValueChange={selectRuntimeMode}
            itemToStringValue={(item) => item.label}
          >
            <SelectTrigger aria-label="Mode d’exécution" className="w-52">
              <SelectValue>
                {runtimeModes.find((mode) => mode.value === runtimeMode)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {runtimeModes.map((mode) => (
                <SelectItem key={mode.value} value={mode}>
                  <span className="flex flex-col">
                    <span>{mode.label}</span>
                    <span className="text-[0.68rem] text-muted-foreground">{mode.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full" scrollbarGutter>
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6">
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement du Thread…</p>
            ) : null}
            {error === undefined ? null : (
              <div
                role="alert"
                className="rounded-xl border border-destructive/35 bg-destructive/10 p-3 text-sm"
              >
                {error}
              </div>
            )}
            {snapshot?.session?.status === "error" && snapshot.session.lastError !== null ? (
              <div
                role="alert"
                className="rounded-xl border border-destructive/35 bg-destructive/10 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                  Session error
                </p>
                <p className="mt-1 text-sm">{snapshot.session.lastError}</p>
              </div>
            ) : null}
            {isHumanInterrupted ? (
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                {interruptedLabel} — le prochain message démarrera un nouveau Turn.
              </div>
            ) : null}

            {snapshot?.transcript.map((item, index) => (
              <article
                key={`${item._tag}-${index}`}
                className={`rounded-2xl border p-4 ${
                  item._tag === "transcript.user"
                    ? "ml-8 border-primary/25 bg-primary/5"
                    : "mr-8 border-border/70 bg-card"
                }`}
              >
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  {transcriptLabel(item)}
                </div>
                {item._tag === "transcript.user" || item._tag === "transcript.assistant" ? (
                  <p className="whitespace-pre-wrap text-sm leading-6">{item.text}</p>
                ) : null}
                {item._tag === "transcript.tool" ? (
                  <p className="text-sm">
                    {item.outputSummary ?? "Action Cursor"} · {item.status}
                  </p>
                ) : null}
                {item._tag === "transcript.plan" ? (
                  <p className="whitespace-pre-wrap text-sm leading-6">{item.markdown}</p>
                ) : null}
                {item._tag === "transcript.permission" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      {item.status === "resolved"
                        ? "Permission traitée."
                        : "Cursor demande une permission."}
                    </span>
                    {item.status === "pending" ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void respondToApproval(item.requestId, "accept")}
                        >
                          Autoriser
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void respondToApproval(item.requestId, "decline")}
                        >
                          Refuser
                        </Button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {item._tag === "transcript.user-input" ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm">{item.prompt ?? "Cursor attend une réponse."}</p>
                    {item.status === "pending" ? (
                      <div className="flex gap-2">
                        <Input
                          value={answerByRequest[item.requestId] ?? ""}
                          onChange={(event) =>
                            setAnswerByRequest((current) => ({
                              ...current,
                              [item.requestId]: event.target.value,
                            }))
                          }
                          aria-label="Réponse à Cursor"
                        />
                        <Button onClick={() => void respondToUserInput(item.requestId)}>
                          Répondre
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}

            {threadId === undefined ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Le titre du Thread sera le premier prompt envoyé.
              </div>
            ) : null}

            {threadId === undefined ? null : (
              <section aria-labelledby="thread-tickets-title" className="rounded-2xl border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id="thread-tickets-title" className="text-sm font-medium">
                    Tickets liés
                  </h2>
                  <Select
                    items={linkableTickets.map((ticket) => ({
                      value: ticket.id,
                      label: ticket.title,
                    }))}
                    value={linkedTicketSelection}
                    onValueChange={linkTicket}
                    disabled={linkableTickets.length === 0}
                  >
                    <SelectTrigger size="sm" className="w-56" aria-label="Lier un ticket">
                      <SelectValue
                        placeholder={
                          linkableTickets.length === 0
                            ? "Tous les tickets sont liés"
                            : "Lier un ticket"
                        }
                      />
                    </SelectTrigger>
                    <SelectPopup>
                      {linkableTickets.map((ticket) => (
                        <SelectItem key={ticket.id} value={ticket.id}>
                          {ticket.title}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
                {linkedTicketIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun Ticket lié à ce Thread.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {linkedTicketIds.map((ticketId) => (
                      <li
                        key={ticketId}
                        className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs"
                      >
                        <span>
                          {board?.tickets.find((ticket) => ticket.id === ticketId)?.title ??
                            ticketId}
                        </span>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => void unlinkTicket(ticketId)}
                          aria-label={`Délier le ticket ${ticketId}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </ScrollArea>
      </div>

      <form onSubmit={submitTurn} className="border-t bg-background/90 p-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-2">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onPaste={rejectImages}
            onDrop={rejectImages}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes("Files")) {
                event.preventDefault()
              }
            }}
            placeholder={
              threadId === undefined
                ? "Premier prompt : il donnera son titre au Thread…"
                : "Écrire un message…"
            }
            aria-label="Composer un message"
            disabled={isRunning || project?.available !== true}
            rows={3}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Images refusées dans la coupe v0.1.
              {composerError === undefined ? null : ` ${composerError}`}
            </p>
            <div className="flex gap-2">
              {isRunning ? (
                <Button type="button" variant="outline" onClick={() => void interruptTurn()}>
                  Interrompre
                </Button>
              ) : null}
              <Button
                type="submit"
                disabled={text.trim() === "" || isRunning || project?.available !== true}
              >
                Envoyer
              </Button>
            </div>
          </div>
        </div>
      </form>
    </main>
  )
}
