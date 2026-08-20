import type { BoardSnapshot } from "@noyau/protocol/board"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import { ApprovalRequestId, TicketId, type ProjectId, type ThreadId } from "@noyau/protocol/ids"
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
import { ThreadComposer } from "@/components/thread/ThreadComposer"
import { ThreadStatusNotices } from "@/components/thread/ThreadStatusNotices"
import {
  ThreadTicketLinkEditor,
  type ThreadTicketLink,
} from "@/components/thread/ThreadTicketLinks"
import { ThreadTranscript } from "@/components/thread/ThreadTranscript"
import {
  buildCommand,
  dispatchCommand,
  loadBoardSnapshot,
  loadThreadSnapshot,
  subscribeThread,
} from "@/lib/control-plane"
import { isCursorReady } from "@/lib/cursor-readiness"
import {
  DEFAULT_THREAD_TITLE,
  makeApprovalRespondRequest,
  makeThreadCreateRequest,
  makeThreadId,
  makeThreadTurnInterruptRequest,
  makeThreadTurnStartRequest,
  makeUserInputRespondRequest,
  seedTitleFromPrompt,
} from "@/lib/thread-commands"
import { applyThreadEnvelope, threadStatusNoticesVisible } from "@/lib/thread-transcript"
import { makeTicketThreadLinkRequest, makeTicketThreadUnlinkRequest } from "@/lib/ticket-commands"

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
      onEvent: (envelope) => {
        const event = envelope.event
        if (
          event._tag === "thread.transcript-appended" ||
          event._tag === "thread.turn.started" ||
          event._tag === "thread.title-seeded" ||
          event._tag === "thread.meta-updated" ||
          event._tag === "approval.responded" ||
          event._tag === "user-input.responded"
        ) {
          setSnapshot((current) => {
            if (current === undefined) {
              return current
            }
            return applyThreadEnvelope(current, envelope) ?? current
          })
          if (event._tag === "thread.turn.started") {
            setRuntimeMode((current) => event.runtimeMode ?? current)
          }
          return
        }
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
          title: DEFAULT_THREAD_TITLE,
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
          titleSeed: seedTitleFromPrompt(prompt),
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
                  void linkTicket(ticketId)
                }}
                onUnlink={(ticketId) => void unlinkTicket(ticketId)}
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
            void respondToApproval(requestId, decision)
          }}
          onRespondUserInput={(requestId) => {
            void respondToUserInput(requestId)
          }}
        />
      </div>

      <ThreadComposer
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
