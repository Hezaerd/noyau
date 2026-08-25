import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import { threadBranchOf, threadWorktreePathOf } from "@noyau/protocol/entities/checkout"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { isResumePrompt } from "@noyau/shared/resume-prompt"
import { useNavigate } from "@tanstack/react-router"
import { DateTime } from "effect"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
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
import { FixMergeConflictsButton } from "@/components/thread/FixMergeConflictsButton"
import { ThreadCheckoutBar } from "@/components/thread/ThreadCheckoutBar"
import { ThreadComposer } from "@/components/thread/ThreadComposer"
import { ThreadDraftHero } from "@/components/thread/ThreadDraftHero"
import { ThreadStatusNotices } from "@/components/thread/ThreadStatusNotices"
import { ThreadTranscript } from "@/components/thread/ThreadTranscript"
import type { DraftAnswers } from "@/components/thread/ThreadUserInputQuestionnaire"
import { useComposerDraft } from "@/hooks/use-composer-draft"
import { useControlPlane } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { useProjectComposerTickets } from "@/hooks/use-project-composer-tickets"
import { useVcsStatus } from "@/hooks/use-vcs-status"
import { invalidInputFailure } from "@/lib/app-failure"
import {
  clearCreatedCheckout,
  draftCheckoutOf,
  envModeLockedOf,
  peekCreatedCheckout,
  rememberCreatedCheckout,
  resolveEffectiveEnvMode,
} from "@/lib/checkout"
import { writeComposerDraft } from "@/lib/composer-drafts"
import {
  appendComposerImages,
  composerImageFailureMessage,
  filesFromClipboard,
  filesFromFileList,
  revokeComposerImages,
  type ComposerImage,
} from "@/lib/composer-images"
import { loadComposerImagesFromAttachments } from "@/lib/composer-images-from-attachments"
import { searchWorkspacePaths, subscribeThread, type SubscriptionStatus } from "@/lib/control-plane"
import { isCursorReady } from "@/lib/cursor-readiness"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"
import { resolveOpenThreadWorking, type OptimisticSend } from "@/lib/thread-activity"
import { getThreadEnvModePreference } from "@/lib/thread-env-mode-preference"
import {
  interruptTurn as interruptTurnAction,
  respondToApproval as respondToApprovalAction,
  respondToUserInput as respondToUserInputAction,
  setThreadModelSelection as setThreadModelSelectionAction,
  submitTurn as submitTurnAction,
} from "@/lib/thread-page-actions"
import { readThreadSnapshotCache, writeThreadSnapshotCache } from "@/lib/thread-snapshot-cache"
import { applyThreadEnvelope, threadStatusNoticesVisible } from "@/lib/thread-transcript"
import { shouldCatchUpTranscriptOnOpen } from "@/lib/thread-transcript-catch-up"
import { markThreadVisited } from "@/lib/thread-visits"
import {
  buildFixMergeConflictsPrompt,
  FIX_MERGE_CONFLICTS_PRESENTATION,
  turnPresentationLabel,
} from "@/lib/turn-presentation"
import { retryableFailedTurnMandate } from "@/lib/undelivered-mandate"
import { toProviderAnswers } from "@/lib/user-input-answers"
import { isConflictingOpenPullRequest, vcsScopeForThread } from "@/lib/vcs-status"

interface ThreadPageProps {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly onCreated: (threadId: ThreadId) => void
  readonly onSelectProject: (projectId: ProjectId) => void
}

export function ThreadPage({ projectId, threadId, onCreated, onSelectProject }: ThreadPageProps) {
  const { cursor, projects } = useControlPlane()
  const navigate = useNavigate()
  const tickets = useProjectComposerTickets(projectId)
  const project = projects.find((candidate) => candidate.id === projectId)
  const [snapshot, setSnapshot] = useState<ThreadSnapshot>()
  const [loading, setLoading] = useState(threadId !== undefined)
  const [actionFailure, setActionFailure] = useState<FailurePresentation>()
  const [composerFailure, setComposerFailure] = useState<FailurePresentation>()
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>()
  const { text, setText, clear: clearDraft } = useComposerDraft(projectId, threadId)
  const createdThreadIdRef = useRef<ThreadId>(undefined)
  const [envMode, setEnvMode] = useState<ThreadEnvMode>(() =>
    threadId === undefined ? getThreadEnvModePreference() : "local",
  )
  const [baseBranch, setBaseBranch] = useState<string | null>(null)
  const [startFromOrigin, setStartFromOrigin] = useState(
    () => threadId === undefined && getThreadEnvModePreference() === "worktree",
  )
  const [images, setImages] = useState<ReadonlyArray<ComposerImage>>([])
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("full-access")
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(null)
  const [draftByRequest, setDraftByRequest] = useState<Record<string, DraftAnswers>>({})
  const [legacyFreeformByRequest, setLegacyFreeformByRequest] = useState<Record<string, string>>({})
  const [optimisticSend, setOptimisticSend] = useState<OptimisticSend | null>(null)
  const [followLatestKey, setFollowLatestKey] = useState(0)
  const restoredFailedTurnRef = useRef<string>(undefined)
  const cursorReady = isCursorReady(cursor)
  const subscriptionFailure = useDelayedSubscriptionFailure(subscriptionStatus)
  const searchPaths = useCallback(
    (query: string) =>
      searchWorkspacePaths(projectId, query).then((result) =>
        result.ok ? result.value.entries : [],
      ),
    [projectId],
  )
  const pageSnapshot =
    snapshot !== undefined && snapshot.thread.id === threadId
      ? snapshot
      : threadId === undefined
        ? undefined
        : readThreadSnapshotCache(threadId)
  const snapshotWorktreePath =
    pageSnapshot === undefined ? null : threadWorktreePathOf(pageSnapshot.thread)
  const gitStatus = useVcsStatus(
    threadId === undefined
      ? null
      : vcsScopeForThread(projectId, { id: threadId, worktreePath: snapshotWorktreePath }),
  )
  const conflictingPr =
    gitStatus?.pr != null && isConflictingOpenPullRequest(gitStatus.pr) ? gitStatus.pr : null
  const retryMandate = retryableFailedTurnMandate({
    resumeCursor: pageSnapshot?.session?.resumeCursor,
    sessionStatus: pageSnapshot?.session?.status,
    transcript: pageSnapshot?.transcript ?? [],
  })

  useEffect(() => {
    if (threadId === undefined) {
      createdThreadIdRef.current = undefined
      clearCreatedCheckout()
      setSnapshot(undefined)
      setLoading(false)
      setSubscriptionStatus(undefined)
      const draftCheckout = draftCheckoutOf(getThreadEnvModePreference())
      setEnvMode(draftCheckout.envMode)
      setBaseBranch(null)
      setStartFromOrigin(draftCheckout.startFromOrigin)
      return
    }
    const cached = readThreadSnapshotCache(threadId)
    const pendingCheckout = peekCreatedCheckout(threadId)
    if (pendingCheckout !== undefined) {
      createdThreadIdRef.current = threadId
      setEnvMode(pendingCheckout.envMode)
      setBaseBranch(pendingCheckout.baseBranch)
      setStartFromOrigin(pendingCheckout.startFromOrigin)
    } else if (cached !== undefined) {
      const boundPath = threadWorktreePathOf(cached.thread)
      setEnvMode(boundPath !== null ? "worktree" : "local")
      setBaseBranch(threadBranchOf(cached.thread))
      setStartFromOrigin(false)
    } else if (threadId !== createdThreadIdRef.current) {
      createdThreadIdRef.current = undefined
      clearCreatedCheckout()
      setEnvMode("local")
      setBaseBranch(null)
      setStartFromOrigin(false)
    }
    // Paint immediately from a warm cache; cold paths still clear then load.
    setSnapshot(cached)
    setLoading(cached === undefined)
    setSubscriptionStatus(undefined)
    if (cached !== undefined) {
      setRuntimeMode(cached.thread.runtimeMode)
      setModelSelection(cached.thread.modelSelection)
    } else {
      setRuntimeMode("full-access")
      setModelSelection(null)
    }
    const commitSnapshot = (next: ThreadSnapshot) => {
      writeThreadSnapshotCache(next)
      setSnapshot(next)
      setRuntimeMode(next.thread.runtimeMode)
      setModelSelection(next.thread.modelSelection)
      const boundPath = threadWorktreePathOf(next.thread)
      if (boundPath !== null) {
        setEnvMode("worktree")
        clearCreatedCheckout(next.thread.id)
      } else if (createdThreadIdRef.current !== next.thread.id) {
        setEnvMode("local")
      }
      const boundBranch = threadBranchOf(next.thread)
      if (
        boundBranch !== null &&
        (boundPath !== null || createdThreadIdRef.current !== next.thread.id)
      ) {
        setBaseBranch(boundBranch)
      }
      setLoading(false)
      setActionFailure(undefined)
    }
    const unsubscribe = subscribeThread(threadId, cached?.snapshotSequence, {
      onSnapshot: (next) => {
        commitSnapshot(next)
      },
      onEvent: (envelope) => {
        const event = envelope.event
        setSnapshot((current) => {
          if (current === undefined) {
            return current
          }
          const next = applyThreadEnvelope(current, envelope) ?? current
          writeThreadSnapshotCache(next)
          return next
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
        if (event._tag === "thread.meta-updated") {
          if (event.worktreePath !== undefined) {
            if (event.worktreePath === null) {
              setEnvMode("local")
            } else {
              setEnvMode("worktree")
              clearCreatedCheckout(event.threadId)
            }
          }
          if (event.branch !== undefined && event.branch !== null) {
            setBaseBranch(event.branch)
          }
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

  const {
    isAuthoritativeWorking: isRunning,
    isWorking,
    workingStartedAtMs,
  } = resolveOpenThreadWorking({
    openThreadId: threadId,
    snapshotThreadId: pageSnapshot?.thread.id,
    sessionStatus: pageSnapshot?.session?.status ?? null,
    latestTurn: pageSnapshot?.thread.latestTurn ?? null,
    send: optimisticSend,
  })
  const activeTurn = pageSnapshot?.session?.activeTurnId ?? pageSnapshot?.thread.latestTurn?.turnId
  const latestTurnCompletedAt = pageSnapshot?.thread.latestTurn?.completedAt

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

  // Catch up to the present when a Thread opens or finishes loading: scroll to
  // end and re-enter following-bottom so a live stream resumes.
  useLayoutEffect(() => {
    if (
      !shouldCatchUpTranscriptOnOpen({
        threadId,
        loading,
        snapshotThreadId: snapshot?.thread.id,
      })
    ) {
      return
    }
    setFollowLatestKey((current) => current + 1)
  }, [threadId, loading, snapshot?.thread.id])

  useEffect(() => {
    if (!isWorking) {
      setOptimisticSend(null)
    }
  }, [isWorking])

  useEffect(() => {
    restoredFailedTurnRef.current = undefined
  }, [threadId])

  useEffect(() => {
    if (retryMandate === undefined || threadId === undefined) {
      return
    }
    if (restoredFailedTurnRef.current === retryMandate.turnId) {
      return
    }
    if ((text.trim() !== "" && !isResumePrompt(text)) || images.length > 0) {
      return
    }
    restoredFailedTurnRef.current = retryMandate.turnId
    const mandateText = retryMandate.text ?? ""
    setText(mandateText)
    if (retryMandate.attachments === undefined || retryMandate.attachments.length === 0) {
      return
    }
    void loadComposerImagesFromAttachments(retryMandate.attachments).then((nextImages) => {
      setImages(nextImages)
      return undefined
    })
  }, [images.length, retryMandate, setText, text, threadId])

  const dispatchTurn = (
    submittedText: string,
    submittedImages: ReadonlyArray<ComposerImage>,
    submittedThreadId: ThreadId | undefined,
  ) => {
    const prompt = submittedText.trim()
    if (
      (prompt === "" && submittedImages.length === 0) ||
      isRunning ||
      project?.available !== true ||
      !cursorReady
    ) {
      return
    }
    const submittedProjectId = projectId
    if (
      envMode === "worktree" &&
      snapshotWorktreePath === null &&
      (baseBranch === null || baseBranch.trim() === "")
    ) {
      setComposerFailure(
        presentFailure(invalidInputFailure("Choisis une branche de base avant d'envoyer."), {
          operation: "thread.turn.start",
          scope: "field",
          initiatedByUser: true,
          hasUsableData: snapshot !== undefined,
        }),
      )
      return
    }
    clearDraft()
    setImages([])
    setComposerFailure(undefined)
    setOptimisticSend({ threadId, startedAtMs: Date.now() })
    setFollowLatestKey((current) => current + 1)
    void submitTurnAction(
      Object.assign(
        {
          projectId,
          threadId,
          prompt,
          runtimeMode,
          modelSelection,
          envMode,
          startFromOrigin,
          worktreePath: snapshotWorktreePath,
          attachments: submittedImages.map((image) => image.upload),
        },
        baseBranch === null ? {} : { baseBranch },
      ),
    ).then((result) => {
      if (result.kind === "composer-error") {
        writeComposerDraft(submittedProjectId, submittedThreadId, submittedText)
        setImages(submittedImages)
        setOptimisticSend(null)
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
        setOptimisticSend(null)
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
        createdThreadIdRef.current = result.threadId
        setOptimisticSend((current) =>
          current === null
            ? current
            : { threadId: result.threadId, startedAtMs: current.startedAtMs },
        )
        rememberCreatedCheckout({
          threadId: result.threadId,
          envMode,
          baseBranch,
          startFromOrigin,
        })
        onCreated(result.threadId)
      }
      revokeComposerImages(submittedImages)
      setActionFailure(undefined)
      return undefined
    })
  }

  const submitTurn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    dispatchTurn(text, images, threadId)
  }

  const retryFailedTurn = () => {
    if (retryMandate === undefined) {
      return
    }
    void loadComposerImagesFromAttachments(retryMandate.attachments).then((nextImages) => {
      const mandateText = retryMandate.text ?? ""
      setText(mandateText)
      setImages(nextImages)
      writeComposerDraft(projectId, threadId, mandateText)
      dispatchTurn(mandateText, nextImages, threadId)
      return undefined
    })
  }

  const submitFixMergeConflicts = () => {
    if (
      conflictingPr === null ||
      threadId === undefined ||
      isRunning ||
      project?.available !== true ||
      !cursorReady
    ) {
      return
    }
    setComposerFailure(undefined)
    setOptimisticSend({ threadId, startedAtMs: Date.now() })
    setFollowLatestKey((current) => current + 1)
    const input = {
      projectId,
      threadId,
      prompt: buildFixMergeConflictsPrompt(conflictingPr),
      titleSeed: turnPresentationLabel(FIX_MERGE_CONFLICTS_PRESENTATION),
      presentation: FIX_MERGE_CONFLICTS_PRESENTATION,
      runtimeMode,
      modelSelection,
      envMode,
      startFromOrigin,
      worktreePath: snapshotWorktreePath,
    } as const
    void submitTurnAction(
      baseBranch === null ? input : Object.assign({}, input, { baseBranch }),
    ).then((result) => {
      if (result.kind === "composer-error") {
        setOptimisticSend(null)
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
        setOptimisticSend(null)
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
    const item = pageSnapshot?.transcript.find(
      (candidate) =>
        candidate._tag === "transcript.user-input" && candidate.requestId === requestId,
    )
    if (item === undefined || item._tag !== "transcript.user-input") {
      return
    }
    const answers = toProviderAnswers(
      item.questions,
      draftByRequest[requestId] ?? {},
      legacyFreeformByRequest[requestId] ?? "",
    )
    if (Object.keys(answers).length === 0) {
      return
    }
    void respondToUserInputAction({ threadId, requestId, answers }).then((result) => {
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
  const worktreePath = pageSnapshot === undefined ? null : threadWorktreePathOf(pageSnapshot.thread)
  const effectiveEnvMode = resolveEffectiveEnvMode({
    worktreePath,
    draftEnvMode: envMode,
  })
  const changeEnvMode = (mode: ThreadEnvMode) => {
    setEnvMode(mode)
    setStartFromOrigin(mode === "worktree")
  }
  const awaitingThread = threadId !== undefined && pageSnapshot === undefined
  const composer = (
    <ThreadComposer
      key={threadId ?? "new"}
      isRunning={isRunning}
      disabled={awaitingThread || project?.available !== true || !cursorReady}
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
      tickets={tickets}
      toolbar={
        isNewThread || conflictingPr === null ? undefined : (
          <FixMergeConflictsButton
            disabled={awaitingThread || project?.available !== true || !cursorReady || isRunning}
            onClick={submitFixMergeConflicts}
          />
        )
      }
      context={
        <ThreadCheckoutBar
          projectId={projectId}
          threadId={threadId}
          branch={baseBranch}
          worktreePath={worktreePath}
          disabled={loading || project?.available !== true}
          envMode={effectiveEnvMode}
          envModeLocked={envModeLockedOf({
            worktreePath,
            latestTurn: pageSnapshot?.thread.latestTurn,
            isRunning,
          })}
          startFromOrigin={startFromOrigin}
          onEnvModeChange={changeEnvMode}
          onBaseBranchChange={setBaseBranch}
          onStartFromOriginChange={setStartFromOrigin}
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
              transcript={pageSnapshot?.transcript ?? []}
              isRunning={isWorking}
              workingStartedAtMs={workingStartedAtMs}
              latestTurn={pageSnapshot?.thread.latestTurn ?? null}
              loading={loading || awaitingThread}
              workspaceRoot={project?.workspaceRoot}
              cwd={
                pageSnapshot === undefined
                  ? project?.workspaceRoot
                  : (threadWorktreePathOf(pageSnapshot.thread) ?? project?.workspaceRoot)
              }
              projectId={projectId}
              tickets={tickets}
              onOpenTicket={(ticketId) => {
                void navigate({
                  to: "/projects/$projectId/board",
                  params: { projectId },
                  search: { ticket: ticketId },
                })
              }}
              error={transcriptError}
              notices={
                threadStatusNoticesVisible(
                  pageSnapshot?.session,
                  pageSnapshot?.thread.latestTurn,
                ) ? (
                  <ThreadStatusNotices
                    session={pageSnapshot?.session}
                    latestTurn={pageSnapshot?.thread.latestTurn}
                    onRetry={retryMandate === undefined ? undefined : retryFailedTurn}
                  />
                ) : null
              }
              draftByRequest={draftByRequest}
              legacyFreeformByRequest={legacyFreeformByRequest}
              onDraftAnswersChange={(requestId, draft) => {
                setDraftByRequest((current) => ({
                  ...current,
                  [requestId]: draft,
                }))
              }}
              onLegacyFreeformChange={(requestId, value) => {
                setLegacyFreeformByRequest((current) => ({
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
              scrollerKey={threadId}
              followLatestKey={followLatestKey}
            />
          </div>
          {composer}
        </>
      )}
    </main>
  )
}
