import type { BoardSnapshot } from "@noyau/protocol/board"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { TicketId, type ProjectId, type ThreadId } from "@noyau/protocol/ids"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react"

import { ThreadComposer } from "@/components/thread/ThreadComposer"
import { ThreadStatusNotices } from "@/components/thread/ThreadStatusNotices"
import {
  ThreadTicketLinkEditor,
  type ThreadTicketLink,
} from "@/components/thread/ThreadTicketLinks"
import { ThreadTranscript } from "@/components/thread/ThreadTranscript"
import { useControlPlane } from "@/hooks/use-control-plane"
import { loadBoardSnapshot, subscribeThread } from "@/lib/control-plane"
import { isCursorReady } from "@/lib/cursor-readiness"
import {
  interruptTurn as interruptTurnAction,
  linkTicket as linkTicketAction,
  respondToApproval as respondToApprovalAction,
  respondToUserInput as respondToUserInputAction,
  submitTurn as submitTurnAction,
  unlinkTicket as unlinkTicketAction,
} from "@/lib/thread-page-actions"
import { applyThreadEnvelope, threadStatusNoticesVisible } from "@/lib/thread-transcript"

interface ThreadPageProps {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly onCreated: (threadId: ThreadId) => void
}

export function ThreadPage({ projectId, threadId, onCreated }: ThreadPageProps) {
  const { cursor, projects } = useControlPlane()
  const project = projects.find((candidate) => candidate.id === projectId)
  const [snapshot, setSnapshot] = useState<ThreadSnapshot>()
  const [board, setBoard] = useState<BoardSnapshot>()
  const [loading, setLoading] = useState(threadId !== undefined)
  const [error, setError] = useState<string>()
  const [composerError, setComposerError] = useState<string>()
  const [text, setText] = useState("")
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("full-access")
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null)
  const [answerByRequest, setAnswerByRequest] = useState<Record<string, string>>({})
  const [linkedTicketSelection, setLinkedTicketSelection] = useState<string | null>(null)
  const cursorReady = isCursorReady(cursor)

  const refreshBoard = useCallback(() => {
    void loadBoardSnapshot(projectId).then((result) => {
      if (result.ok) {
        setBoard(result.value)
      }
      return undefined
    })
  }, [projectId])

  useEffect(() => {
    refreshBoard()
  }, [refreshBoard])

  useEffect(() => {
    if (threadId === undefined) {
      setSnapshot(undefined)
      setLoading(false)
      return
    }
    setLoading(true)
    return subscribeThread(threadId, undefined, {
      onSnapshot: (next) => {
        setSnapshot(next)
        setRuntimeMode(next.thread.runtimeMode)
        setModelSelection(next.thread.modelSelection)
        setLoading(false)
        setError(undefined)
      },
      onEvent: (envelope) => {
        const event = envelope.event
        setSnapshot((current) => {
          if (current === undefined) {
            return current
          }
          return applyThreadEnvelope(current, envelope) ?? current
        })
        if (event._tag === "thread.turn.started") {
          setRuntimeMode((current) => event.runtimeMode ?? current)
          if (event.modelSelection !== undefined) {
            setModelSelection(event.modelSelection)
          }
        }
        if (event._tag === "thread.runtime-mode-set") {
          setRuntimeMode(event.runtimeMode)
        }
      },
      onError: (details) => {
        setError(details)
        setLoading(false)
      },
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

  const submitTurn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const prompt = text.trim()
    if (prompt === "" || isRunning || project?.available !== true || !cursorReady) {
      return
    }
    setText("")
    setComposerError(undefined)
    void submitTurnAction({ projectId, threadId, prompt, runtimeMode, modelSelection }).then(
      (result) => {
        if (result.kind === "composer-error") {
          setComposerError(result.details)
          return undefined
        }
        if (result.kind === "error") {
          setError(result.details)
          return undefined
        }
        if (result.kind === "created") {
          onCreated(result.threadId)
        }
        return undefined
      },
    )
  }

  const interruptTurn = () => {
    if (threadId === undefined) {
      return
    }
    void interruptTurnAction(
      activeTurn === undefined ? { threadId } : { threadId, turnId: activeTurn },
    ).then((result) => {
      if (!result.ok) {
        setError(result.details)
      }
      return undefined
    })
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

  const respondToApproval = (requestId: string, decision: "accept" | "decline") => {
    if (threadId === undefined) {
      return
    }
    void respondToApprovalAction({ threadId, requestId, decision }).then((result) => {
      if (!result.ok) {
        setError(result.details)
      }
      return undefined
    })
  }

  const respondToUserInput = (requestId: string) => {
    if (threadId === undefined) {
      return
    }
    const answer = answerByRequest[requestId]?.trim()
    if (answer === undefined || answer === "") {
      return
    }
    void respondToUserInputAction({ threadId, requestId, answer }).then((result) => {
      if (!result.ok) {
        setError(result.details)
      }
      return undefined
    })
  }

  const linkTicket = (ticketId: string | null) => {
    setLinkedTicketSelection(null)
    if (threadId === undefined || ticketId === null) {
      return
    }
    void linkTicketAction({
      threadId,
      ticketId: TicketId.make(ticketId),
      projectId,
    }).then((result) => {
      if (!result.ok) {
        setError(result.details)
        return undefined
      }
      if (result.board.ok) {
        setBoard(result.board.value)
      }
      return undefined
    })
  }

  const unlinkTicket = (ticketId: TicketId) => {
    if (threadId === undefined) {
      return
    }
    void unlinkTicketAction({ threadId, ticketId, projectId }).then((result) => {
      if (!result.ok) {
        setError(result.details)
        return undefined
      }
      if (result.board.ok) {
        setBoard(result.board.value)
      }
      return undefined
    })
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ThreadTranscript
          transcript={snapshot?.transcript ?? []}
          isRunning={isRunning}
          loading={loading}
          error={error}
          notices={
            threadStatusNoticesVisible(snapshot?.session, snapshot?.thread.latestTurn) ? (
              <ThreadStatusNotices
                session={snapshot?.session}
                latestTurn={snapshot?.thread.latestTurn}
              />
            ) : null
          }
          footer={
            threadId === undefined ? null : (
              <ThreadTicketLinkEditor
                linkedTickets={linkedTicketLinks}
                linkableTickets={linkableTicketLinks}
                selection={linkedTicketSelection}
                onSelectionChange={(ticketId) => {
                  setLinkedTicketSelection(ticketId)
                  linkTicket(ticketId)
                }}
                onUnlink={(ticketId) => unlinkTicket(ticketId)}
              />
            )
          }
          answerByRequest={answerByRequest}
          onAnswerChange={(requestId, value) => {
            setAnswerByRequest((current) => ({
              ...current,
              [requestId]: value,
            }))
          }}
          onRespondApproval={(requestId, decision) => {
            respondToApproval(requestId, decision)
          }}
          onRespondUserInput={(requestId) => {
            respondToUserInput(requestId)
          }}
        />
      </div>

      <ThreadComposer
        isRunning={isRunning}
        disabled={project?.available !== true || !cursorReady}
        text={text}
        runtimeMode={runtimeMode}
        models={cursor?.models ?? []}
        modelSelection={modelSelection}
        error={composerError}
        onSubmit={submitTurn}
        onTextChange={setText}
        onRuntimeModeChange={setRuntimeMode}
        onModelSelectionChange={setModelSelection}
        onPaste={rejectImages}
        onDrop={rejectImages}
        onInterrupt={() => interruptTurn()}
      />
    </main>
  )
}
