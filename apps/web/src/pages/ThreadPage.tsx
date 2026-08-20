import type { BoardSnapshot } from "@noyau/protocol/board"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import {
  ApprovalRequestId,
  KanbanColumnId,
  TicketId,
  type ProjectId,
  type ThreadId,
} from "@noyau/protocol/ids"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, ListPlusIcon } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react"

import { useControlPlane } from "@/components/control-plane-context"
import { CursorReadinessChip } from "@/components/thread/CursorReadinessChip"
import { ThreadComposer } from "@/components/thread/ThreadComposer"
import { ThreadRuntimeModePicker } from "@/components/thread/ThreadRuntimeModePicker"
import { ThreadStatusNotices } from "@/components/thread/ThreadStatusNotices"
import {
  ThreadTicketChips,
  ThreadTicketLinkEditor,
  type ThreadTicketLink,
} from "@/components/thread/ThreadTicketLinks"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  buildCommand,
  dispatchCommand,
  loadBoardSnapshot,
  loadThreadSnapshot,
  subscribeThread,
} from "@/lib/control-plane"
import { isCursorReady } from "@/lib/cursor-readiness"
import {
  makeApprovalRespondRequest,
  makeThreadCreateRequest,
  makeThreadId,
  makeThreadRuntimeModeSetRequest,
  makeThreadTurnInterruptRequest,
  makeThreadTurnStartRequest,
  makeUserInputRespondRequest,
} from "@/lib/thread-commands"
import { threadTicketDescription } from "@/lib/thread-ticket-draft"
import {
  makeTicketCreateRequest,
  makeTicketThreadLinkRequest,
  makeTicketThreadUnlinkRequest,
  makeTicketUpdateRequest,
} from "@/lib/ticket-commands"

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

const transcriptItemKey = (item: TranscriptItem): string => {
  switch (item._tag) {
    case "transcript.user":
    case "transcript.assistant":
      return `${item._tag}-${item.turnId}-${item.text}`
    case "transcript.tool":
      return `${item._tag}-${item.turnId}-${item.toolCallId}`
    case "transcript.permission":
    case "transcript.user-input":
      return `${item._tag}-${item.turnId}-${item.requestId}`
    case "transcript.plan":
      return `${item._tag}-${item.turnId}-${item.markdown}`
  }
}

interface ThreadPageProps {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly onCreated: (threadId: ThreadId) => void
  readonly onTicketCreated: (ticketId: TicketId) => void
}

export function ThreadPage({ projectId, threadId, onCreated, onTicketCreated }: ThreadPageProps) {
  const { cursor, projects } = useControlPlane()
  const project = projects.find((candidate) => candidate.id === projectId)
  const [snapshot, setSnapshot] = useState<ThreadSnapshot>()
  const [board, setBoard] = useState<BoardSnapshot>()
  const [loading, setLoading] = useState(threadId !== undefined)
  const [error, setError] = useState<string>()
  const [composerError, setComposerError] = useState<string>()
  const [text, setText] = useState("")
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("full-access")
  const [answerByRequest, setAnswerByRequest] = useState<Record<string, string>>({})
  const [linkedTicketSelection, setLinkedTicketSelection] = useState<string | null>(null)
  const cursorReady = isCursorReady(cursor)

  const refreshThread = useCallback(async () => {
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
  }, [threadId])

  const refreshBoard = useCallback(async () => {
    const result = await loadBoardSnapshot(projectId)
    if (result.ok) {
      setBoard(result.value)
    }
  }, [projectId])

  useEffect(() => {
    void refreshBoard()
  }, [refreshBoard])

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
  }, [refreshBoard, refreshThread, threadId])

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
  const linkedTicketLinks = linkedTicketIds.map((ticketId) => ({
    id: ticketId,
    title: board?.tickets.find((ticket) => ticket.id === ticketId)?.title ?? ticketId,
  })) satisfies ReadonlyArray<ThreadTicketLink>
  const linkableTicketLinks = linkableTickets.map((ticket) => ({
    id: ticket.id,
    title: ticket.title,
  })) satisfies ReadonlyArray<ThreadTicketLink>
  const activeTurn = snapshot?.session?.activeTurnId ?? snapshot?.thread.latestTurn?.turnId
  const isRunning =
    snapshot?.session?.status === "running" || snapshot?.thread.latestTurn?.state === "running"
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
    if (prompt === "" || isRunning || project?.available !== true || !cursorReady) {
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
    const input = activeTurn === undefined ? { threadId } : { threadId, turnId: activeTurn }
    const request = await buildCommand(makeThreadTurnInterruptRequest(input))
    if (!request.ok) {
      setError(request.details)
      return
    }
    await dispatch(request.value)
  }

  const selectRuntimeMode = async (value: typeof runtimeMode) => {
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

  const createTicketFromThread = async () => {
    if (threadId === undefined || snapshot === undefined || board === undefined) {
      return
    }
    const column = board.columns.find((candidate) => !candidate.done)
    if (column === undefined) {
      setError("Aucune colonne non terminale ne permet de créer un Ticket.")
      return
    }
    const createRequest = await buildCommand(
      makeTicketCreateRequest({
        projectId,
        title: snapshot.thread.title,
        placement: { columnId: KanbanColumnId.make(column.id) },
      }),
    )
    if (!createRequest.ok) {
      setError(createRequest.details)
      return
    }
    const ticketId = createRequest.value.payload.ticketId
    if (!(await dispatch(createRequest.value))) {
      return
    }

    const description = threadTicketDescription(snapshot.transcript)
    if (description !== "") {
      const updateRequest = await buildCommand(makeTicketUpdateRequest({ ticketId, description }))
      if (!updateRequest.ok || !(await dispatch(updateRequest.value))) {
        if (!updateRequest.ok) {
          setError(updateRequest.details)
        }
        return
      }
    }

    const linkRequest = await buildCommand(makeTicketThreadLinkRequest({ ticketId, threadId }))
    if (!linkRequest.ok || !(await dispatch(linkRequest.value))) {
      if (!linkRequest.ok) {
        setError(linkRequest.details)
      }
      return
    }
    onTicketCreated(ticketId)
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
            <ThreadTicketChips projectId={projectId} tickets={linkedTicketLinks} />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              render={
                <Link
                  to="/projects/$projectId/board"
                  params={{ projectId }}
                  aria-label="Retour au Tableau"
                />
              }
              variant="outline"
              size="sm"
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Tableau
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={threadId === undefined || board === undefined}
              onClick={() => void createTicketFromThread()}
            >
              <ListPlusIcon data-icon="inline-start" />
              Créer un Ticket
            </Button>
            <CursorReadinessChip status={cursor} />
            <ThreadRuntimeModePicker value={runtimeMode} onChange={selectRuntimeMode} />
          </div>
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
            <ThreadStatusNotices
              session={snapshot?.session}
              latestTurn={snapshot?.thread.latestTurn}
            />

            {snapshot?.transcript.map((item) => (
              <article
                key={transcriptItemKey(item)}
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
              <ThreadTicketLinkEditor
                linkedTickets={linkedTicketLinks}
                linkableTickets={linkableTicketLinks}
                selection={linkedTicketSelection}
                onSelectionChange={(ticketId) => {
                  setLinkedTicketSelection(ticketId)
                  void linkTicket(ticketId)
                }}
                onUnlink={(ticketId) => void unlinkTicket(ticketId)}
              />
            )}
          </div>
        </ScrollArea>
      </div>

      <ThreadComposer
        isNewThread={threadId === undefined}
        isRunning={isRunning}
        disabled={project?.available !== true || !cursorReady}
        text={text}
        error={composerError}
        onSubmit={submitTurn}
        onTextChange={setText}
        onPaste={rejectImages}
        onDrop={rejectImages}
        onInterrupt={() => void interruptTurn()}
      />
    </main>
  )
}
