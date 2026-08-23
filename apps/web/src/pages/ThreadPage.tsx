import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import { threadBranchOf, threadWorktreePathOf } from "@noyau/protocol/entities/checkout"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { DateTime } from "effect"
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
import { ThreadCheckoutBar } from "@/components/thread/ThreadCheckoutBar"
import { ThreadComposer } from "@/components/thread/ThreadComposer"
import { ThreadDraftHero } from "@/components/thread/ThreadDraftHero"
import { ThreadStatusNotices } from "@/components/thread/ThreadStatusNotices"
import { ThreadTranscript } from "@/components/thread/ThreadTranscript"
import { useComposerDraft } from "@/hooks/use-composer-draft"
import { useControlPlane } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { invalidInputFailure } from "@/lib/app-failure"
import { envModeLockedAfterFirstTurn } from "@/lib/checkout"
import { writeComposerDraft } from "@/lib/composer-drafts"
import {
  appendComposerImages,
  composerImageFailureMessage,
  filesFromClipboard,
  filesFromFileList,
  revokeComposerImages,
  type ComposerImage,
} from "@/lib/composer-images"
import { searchWorkspacePaths, subscribeThread, type SubscriptionStatus } from "@/lib/control-plane"
import { isCursorReady } from "@/lib/cursor-readiness"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"
import { deriveActiveWorkStartedAtMs } from "@/lib/thread-activity"
import {
  interruptTurn as interruptTurnAction,
  respondToApproval as respondToApprovalAction,
  respondToUserInput as respondToUserInputAction,
  setThreadModelSelection as setThreadModelSelectionAction,
  submitTurn as submitTurnAction,
} from "@/lib/thread-page-actions"
import { applyThreadEnvelope, threadStatusNoticesVisible } from "@/lib/thread-transcript"
import { markThreadVisited } from "@/lib/thread-visits"

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
  const { text, setText, clear: clearDraft } = useComposerDraft(projectId, threadId)
  const [envMode, setEnvMode] = useState<ThreadEnvMode>("local")
  const [baseBranch, setBaseBranch] = useState("main")
  const [images, setImages] = useState<ReadonlyArray<ComposerImage>>([])
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("full-access")
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null)
  const [answerByRequest, setAnswerByRequest] = useState<Record<string, string>>({})
  const [sendStartedAtMs, setSendStartedAtMs] = useState<number | null>(null)
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
    const unsubscribe = subscribeThread(threadId, undefined, {
      onSnapshot: (next) => {
        setSnapshot(next)
        setRuntimeMode(next.thread.runtimeMode)
        setModelSelection(next.thread.modelSelection)
        setEnvMode(threadWorktreePathOf(next.thread) === null ? "local" : "worktree")
        const boundBranch = threadBranchOf(next.thread)
        if (boundBranch !== null) {
          setBaseBranch(boundBranch)
        }
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
    return () => {
      unsubscribe()
      setImages((current) => {
        revokeComposerImages(current)
        return []
      })
    }
  }, [threadId])

  const activeTurn = snapshot?.session?.activeTurnId ?? snapshot?.thread.latestTurn?.turnId
  const isRunning =
    snapshot?.session?.status === "running" || snapshot?.thread.latestTurn?.state === "running"
  const isWorking = isRunning || sendStartedAtMs !== null
  const workingStartedAtMs = deriveActiveWorkStartedAtMs({
    latestTurn: snapshot?.thread.latestTurn ?? null,
    sendStartedAtMs,
  })
  const latestTurnCompletedAt = snapshot?.thread.latestTurn?.completedAt

  useEffect(() => {
    if (threadId === undefined) {
      return
    }
    markThreadVisited(threadId, Date.now())
  }, [threadId])

  useEffect(() => {
    if (threadId === undefined || latestTurnCompletedAt == null) {
      return
    }
    markThreadVisited(threadId, DateTime.toEpochMillis(latestTurnCompletedAt))
  }, [latestTurnCompletedAt, threadId])

  useEffect(() => {
    if (isRunning) {
      setSendStartedAtMs(null)
    }
  }, [isRunning])

  const submitTurn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const prompt = text.trim()
    if (
      (prompt === "" && images.length === 0) ||
      isRunning ||
      project?.available !== true ||
      !cursorReady
    ) {
      return
    }
    const submittedText = text
    const submittedImages = images
    const submittedProjectId = projectId
    const submittedThreadId = threadId
    clearDraft()
    setImages([])
    setComposerFailure(undefined)
    setSendStartedAtMs(Date.now())
    void submitTurnAction({
      projectId,
      threadId,
      prompt,
      runtimeMode,
      modelSelection,
      envMode,
      baseBranch,
      worktreePath: snapshot === undefined ? null : threadWorktreePathOf(snapshot.thread),
      attachments: submittedImages.map((image) => image.upload),
    }).then((result) => {
      if (result.kind === "composer-error") {
        writeComposerDraft(submittedProjectId, submittedThreadId, submittedText)
        setImages(submittedImages)
        setSendStartedAtMs(null)
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
        writeComposerDraft(submittedProjectId, submittedThreadId, submittedText)
        setImages(submittedImages)
        setSendStartedAtMs(null)
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
      revokeComposerImages(submittedImages)
      setActionFailure(undefined)
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

  const attachFiles = (files: ReadonlyArray<File>) => {
    if (files.length === 0) {
      return
    }
    void appendComposerImages(images, files).then((result) => {
      setImages(result.images)
      if (!result.ok) {
        setComposerFailure(
          presentFailure(invalidInputFailure(composerImageFailureMessage(result.reason)), {
            operation: "thread.turn.start",
            scope: "field",
            initiatedByUser: true,
            hasUsableData: true,
          }),
        )
      } else {
        setComposerFailure(undefined)
      }
      return undefined
    })
  }

  const acceptImages = (event: ClipboardEvent<HTMLElement> | DragEvent<HTMLElement>) => {
    const files =
      "clipboardData" in event
        ? filesFromClipboard(event.clipboardData)
        : filesFromFileList(event.dataTransfer.files)
    if (files.length === 0) {
      return
    }
    event.preventDefault()
    attachFiles(files)
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
      images={images}
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
      onPaste={acceptImages}
      onDrop={acceptImages}
      onImageRemove={(localId) => {
        setImages((current) => {
          const removed = current.find((image) => image.localId === localId)
          if (removed !== undefined) {
            URL.revokeObjectURL(removed.previewUrl)
          }
          return current.filter((image) => image.localId !== localId)
        })
        setComposerFailure(undefined)
      }}
      onInterrupt={() => interruptTurn()}
      searchPaths={searchPaths}
      context={
        <ThreadCheckoutBar
          projectId={projectId}
          threadId={threadId}
          branch={snapshot === undefined ? null : threadBranchOf(snapshot.thread)}
          worktreePath={snapshot === undefined ? null : threadWorktreePathOf(snapshot.thread)}
          disabled={loading || project?.available !== true}
          envMode={envMode}
          envModeLocked={envModeLockedAfterFirstTurn({
            latestTurn: snapshot?.thread.latestTurn,
            isRunning,
          })}
          onEnvModeChange={setEnvMode}
          onBaseBranchChange={setBaseBranch}
        />
      }
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
              isRunning={isWorking}
              workingStartedAtMs={workingStartedAtMs}
              latestTurn={snapshot?.thread.latestTurn ?? null}
              loading={loading}
              workspaceRoot={project?.workspaceRoot}
              cwd={
                snapshot === undefined
                  ? project?.workspaceRoot
                  : (threadWorktreePathOf(snapshot.thread) ?? project?.workspaceRoot)
              }
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
