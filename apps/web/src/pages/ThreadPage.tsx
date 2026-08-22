import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import {
  useCallback,
  useEffect,
  useState,
  type DragEvent,
  type ClipboardEvent,
  type FormEvent,
} from "react"

import {
  InlineFailure,
  ResourceErrorState,
  ScopeBanner,
} from "@/components/failure/FailureSurfaces"
import { ThreadComposer } from "@/components/thread/ThreadComposer"
import { ThreadDraftHero } from "@/components/thread/ThreadDraftHero"
import { ThreadStatusNotices } from "@/components/thread/ThreadStatusNotices"
import { ThreadTranscript } from "@/components/thread/ThreadTranscript"
import { useControlPlane } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { invalidInputFailure } from "@/lib/app-failure"
import { searchWorkspacePaths, subscribeThread, type SubscriptionStatus } from "@/lib/control-plane"
import { isCursorReady } from "@/lib/cursor-readiness"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"
import {
  interruptTurn as interruptTurnAction,
  respondToApproval as respondToApprovalAction,
  respondToUserInput as respondToUserInputAction,
  setThreadModelSelection as setThreadModelSelectionAction,
  submitTurn as submitTurnAction,
} from "@/lib/thread-page-actions"
import { applyThreadEnvelope, threadStatusNoticesVisible } from "@/lib/thread-transcript"

interface ThreadPageProps {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly onCreated: (threadId: ThreadId) => void
  readonly onSelectProject: (projectId: ProjectId) => void
}

export function ThreadPage({ projectId, threadId, onCreated, onSelectProject }: ThreadPageProps) {
  const { cursor, projects } = useControlPlane()
  const project = projects.find((candidate) => candidate.id === projectId)
  const [snapshot, setSnapshot] = useState<ThreadSnapshot>()
  const [loading, setLoading] = useState(threadId !== undefined)
  const [actionFailure, setActionFailure] = useState<FailurePresentation>()
  const [composerFailure, setComposerFailure] = useState<FailurePresentation>()
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>()
  const [text, setText] = useState("")
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("full-access")
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null)
  const [answerByRequest, setAnswerByRequest] = useState<Record<string, string>>({})
  const cursorReady = isCursorReady(cursor)
  const subscriptionFailure = useDelayedSubscriptionFailure(subscriptionStatus)
  const searchPaths = useCallback(
    (query: string) =>
      searchWorkspacePaths(projectId, query).then((result) =>
        result.ok ? result.value.entries : [],
      ),
    [projectId],
  )

  useEffect(() => {
    if (threadId === undefined) {
      setSnapshot(undefined)
      setLoading(false)
      setSubscriptionStatus(undefined)
      return
    }
    setSnapshot(undefined)
    setLoading(true)
    setSubscriptionStatus(undefined)
    setRuntimeMode("full-access")
    setModelSelection(null)
    return subscribeThread(threadId, undefined, {
      onSnapshot: (next) => {
        setSnapshot(next)
        setRuntimeMode(next.thread.runtimeMode)
        setModelSelection(next.thread.modelSelection)
        setLoading(false)
        setActionFailure(undefined)
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
        if (event._tag === "thread.model-selection-set") {
          setModelSelection(event.modelSelection)
        }
      },
      onStatus: (status) => {
        setSubscriptionStatus(status)
        if (status._tag === "Reconnecting") setLoading(false)
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
    setComposerFailure(undefined)
    void submitTurnAction({ projectId, threadId, prompt, runtimeMode, modelSelection }).then(
      (result) => {
        if (result.kind === "composer-error") {
          setComposerFailure(
            presentFailure(result.failure, {
              operation: "thread.turn.start",
              scope: "action",
              initiatedByUser: true,
              hasUsableData: snapshot !== undefined,
            }),
          )
          return undefined
        }
        if (result.kind === "error") {
          setActionFailure(
            presentFailure(result.failure, {
              operation: "thread.turn.start",
              scope: "action",
              initiatedByUser: true,
              hasUsableData: snapshot !== undefined,
            }),
          )
          return undefined
        }
        if (result.kind === "created") {
          onCreated(result.threadId)
        }
        setActionFailure(undefined)
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
        setActionFailure(
          presentFailure(result.failure, {
            operation: "thread.turn.interrupt",
            scope: "action",
            initiatedByUser: true,
            hasUsableData: true,
          }),
        )
      } else {
        setActionFailure(undefined)
      }
      return undefined
    })
  }

  const rejectImages = (event: ClipboardEvent<HTMLElement> | DragEvent<HTMLElement>) => {
    const hasImage =
      "clipboardData" in event
        ? Array.from(event.clipboardData.items).some((item) => item.type.startsWith("image/"))
        : Array.from(event.dataTransfer.files).some((file) => file.type.startsWith("image/"))
    if (!hasImage) {
      return
    }
    event.preventDefault()
    setComposerFailure(
      presentFailure(
        invalidInputFailure("Les images ne sont pas prises en charge dans les Threads v0.1."),
        {
          operation: "thread.turn.start",
          scope: "field",
          initiatedByUser: true,
          hasUsableData: true,
        },
      ),
    )
  }

  const changeModelSelection = (nextSelection: ModelSelection | null) => {
    setModelSelection(nextSelection)
    setComposerFailure(undefined)
    if (threadId === undefined) {
      return
    }
    void setThreadModelSelectionAction({ threadId, modelSelection: nextSelection }).then(
      (result) => {
        if (!result.ok) {
          setComposerFailure(
            presentFailure(result.failure, {
              operation: "thread.model-selection.set",
              scope: "field",
              initiatedByUser: true,
              hasUsableData: snapshot !== undefined,
            }),
          )
        }
        return undefined
      },
    )
  }

  const respondToApproval = (requestId: string, decision: "accept" | "decline") => {
    if (threadId === undefined) {
      return
    }
    void respondToApprovalAction({ threadId, requestId, decision }).then((result) => {
      if (!result.ok) {
        setActionFailure(
          presentFailure(result.failure, {
            operation: "thread.turn.respond",
            scope: "action",
            initiatedByUser: true,
            hasUsableData: true,
          }),
        )
      } else {
        setActionFailure(undefined)
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
        setActionFailure(
          presentFailure(result.failure, {
            operation: "thread.turn.respond",
            scope: "action",
            initiatedByUser: true,
            hasUsableData: true,
          }),
        )
      } else {
        setActionFailure(undefined)
      }
      return undefined
    })
  }

  const streamPresentation =
    subscriptionFailure === undefined
      ? undefined
      : presentFailure(subscriptionFailure, {
          operation: "thread.subscribe",
          scope: "resource",
          initiatedByUser: false,
          hasUsableData: snapshot !== undefined,
        })

  if (
    threadId !== undefined &&
    snapshot === undefined &&
    !loading &&
    streamPresentation !== undefined
  ) {
    return (
      <ResourceErrorState
        presentation={streamPresentation}
        onRecovery={() => window.location.reload()}
      />
    )
  }

  const transcriptFailure = streamPresentation ?? actionFailure
  const isNewThread = threadId === undefined
  const composerError = composerFailure ?? (isNewThread ? actionFailure : undefined)
  const transcriptError =
    transcriptFailure === undefined ? undefined : transcriptFailure.surface === "banner" ? (
      <ScopeBanner presentation={transcriptFailure} />
    ) : (
      <InlineFailure presentation={transcriptFailure} />
    )
  const composer = (
    <ThreadComposer
      isRunning={isRunning}
      disabled={loading || project?.available !== true || !cursorReady}
      text={text}
      runtimeMode={runtimeMode}
      models={cursor?.models ?? []}
      modelSelection={modelSelection}
      placement={isNewThread ? "hero" : "docked"}
      error={
        composerError === undefined ? undefined : (
          <InlineFailure className="text-xs" presentation={composerError} />
        )
      }
      onSubmit={submitTurn}
      onTextChange={(value) => {
        setText(value)
        setComposerFailure(undefined)
      }}
      onRuntimeModeChange={setRuntimeMode}
      onModelSelectionChange={changeModelSelection}
      onPaste={rejectImages}
      onDrop={rejectImages}
      onInterrupt={() => interruptTurn()}
      searchPaths={searchPaths}
    />
  )

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {isNewThread ? (
        <ThreadDraftHero
          projectName={project?.name}
          projects={projects}
          selectedProjectId={projectId}
          onSelectProject={onSelectProject}
        >
          {composer}
        </ThreadDraftHero>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ThreadTranscript
              transcript={snapshot?.transcript ?? []}
              isRunning={isRunning}
              loading={loading}
              workspaceRoot={project?.workspaceRoot}
              projectId={projectId}
              error={transcriptError}
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
          {composer}
        </>
      )}
    </main>
  )
}
