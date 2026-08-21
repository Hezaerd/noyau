import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { useEffect, useState, type DragEvent, type ClipboardEvent, type FormEvent } from "react"

import { ThreadComposer } from "@/components/thread/ThreadComposer"
import { ThreadStatusNotices } from "@/components/thread/ThreadStatusNotices"
import { ThreadTranscript } from "@/components/thread/ThreadTranscript"
import { useControlPlane } from "@/hooks/use-control-plane"
import { subscribeThread } from "@/lib/control-plane"
import { isCursorReady } from "@/lib/cursor-readiness"
import {
  interruptTurn as interruptTurnAction,
  respondToApproval as respondToApprovalAction,
  respondToUserInput as respondToUserInputAction,
  submitTurn as submitTurnAction,
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
  const [loading, setLoading] = useState(threadId !== undefined)
  const [error, setError] = useState<string>()
  const [composerError, setComposerError] = useState<string>()
  const [text, setText] = useState("")
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("full-access")
  const [answerByRequest, setAnswerByRequest] = useState<Record<string, string>>({})
  const cursorReady = isCursorReady(cursor)

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
    void submitTurnAction({ projectId, threadId, prompt, runtimeMode }).then((result) => {
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
    })
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
        error={composerError}
        onSubmit={submitTurn}
        onTextChange={setText}
        onPaste={rejectImages}
        onDrop={rejectImages}
        onInterrupt={() => interruptTurn()}
      />
    </main>
  )
}
