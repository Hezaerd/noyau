import type { ThreadEnvMode } from "@noyau/protocol/entities/checkout"
import { threadBranchOf, threadWorktreePathOf } from "@noyau/protocol/entities/checkout"
import type { Provider } from "@noyau/protocol/entities/environment"
import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { TurnPresentation } from "@noyau/protocol/entities/transcript"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { isResumePrompt } from "@noyau/shared/resume-prompt"
import { useNavigate } from "@tanstack/react-router"
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
import { FixCiButton } from "@/components/thread/FixCiButton"
import { FixMergeConflictsButton } from "@/components/thread/FixMergeConflictsButton"
import { ThreadCheckoutBar } from "@/components/thread/ThreadCheckoutBar"
import { ThreadComposer } from "@/components/thread/ThreadComposer"
import { ThreadDraftHero } from "@/components/thread/ThreadDraftHero"
import { ThreadStatusNotices } from "@/components/thread/ThreadStatusNotices"
import { ThreadTranscript } from "@/components/thread/ThreadTranscript"
import {
  ThreadTurnDiffPanel,
  type ThreadTurnDiffTarget,
} from "@/components/thread/ThreadTurnDiffPanel"
import type { DraftAnswers } from "@/components/thread/ThreadUserInputQuestionnaire"
import { useComposerDraft } from "@/hooks/use-composer-draft"
import { useClaude, useCodex, useCursor, useProjects } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { useProjectComposerTickets } from "@/hooks/use-project-composer-tickets"
import { useThreadSnapshot } from "@/hooks/use-thread-snapshot"
import { useThreadVisitTracking } from "@/hooks/use-thread-visit-tracking"
import { useVcsStatus } from "@/hooks/use-vcs-status"
import { invalidInputFailure } from "@/lib/app-failure"
import { clearAssistantPaint, pushAssistantLive } from "@/lib/assistant-paint"
import {
  clearCreatedCheckout,
  draftCheckoutOf,
  envModeLockedOf,
  peekCreatedCheckout,
  rememberCreatedCheckout,
  resolveEffectiveEnvMode,
} from "@/lib/checkout"
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
import { makeOptimisticThreadShell } from "@/lib/control-plane-state"
import { isCursorReady } from "@/lib/cursor-readiness"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"
import { resolveOpenThreadWorking, type OptimisticSend } from "@/lib/thread-activity"
import { seedTitleFromTurn } from "@/lib/thread-commands"
import {
  interruptTurn as interruptTurnAction,
  respondToApproval as respondToApprovalAction,
  respondToUserInput as respondToUserInputAction,
  setThreadModelSelection as setThreadModelSelectionAction,
  submitTurn as submitTurnAction,
} from "@/lib/thread-page-actions"
import { threadStatusNoticesVisible } from "@/lib/thread-transcript"
import { shouldCatchUpTranscriptOnOpen } from "@/lib/thread-transcript-catch-up"
import {
  buildFixCiPrompt,
  buildFixMergeConflictsPrompt,
  FIX_CI_PRESENTATION,
  FIX_MERGE_CONFLICTS_PRESENTATION,
  turnPresentationLabel,
} from "@/lib/turn-presentation"
import { retryableFailedTurnMandate } from "@/lib/undelivered-mandate"
import { toProviderAnswers } from "@/lib/user-input-answers"
import {
  displayedThreadPr,
  isConflictingOpenPullRequest,
  isFailingCiOpenPullRequest,
  vcsScopeForThread,
} from "@/lib/vcs-status"
import { writeComposerDraft } from "@/state/composer-drafts"
import { getThreadEnvModePreference } from "@/state/preferences"
import { publishCreatedThread } from "@/state/shell"
import {
  getThreadSnapshot,
  reduceThreadSnapshotEnvelope,
  replaceThreadSnapshot,
} from "@/state/thread-snapshot"

interface ThreadPageProps {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly onCreated: (threadId: ThreadId) => void
  readonly onSelectProject: (projectId: ProjectId) => void
}

export function ThreadPage({ projectId, threadId, onCreated, onSelectProject }: ThreadPageProps) {
  const cursor = useCursor()
  const claude = useClaude()
  const codex = useCodex()
  const projects = useProjects()
  const navigate = useNavigate()
  const tickets = useProjectComposerTickets(projectId)
  const project = projects.find((candidate) => candidate.id === projectId)
  const snapshot = useThreadSnapshot(threadId)
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
  const [draftProvider, setDraftProvider] = useState<Provider>("cursor")
  const [draftByRequest, setDraftByRequest] = useState<Record<string, DraftAnswers>>({})
  const [legacyFreeformByRequest, setLegacyFreeformByRequest] = useState<Record<string, string>>({})
  const [optimisticSend, setOptimisticSend] = useState<OptimisticSend | null>(null)
  const [followLatestKey, setFollowLatestKey] = useState(0)
  const [turnDiffTarget, setTurnDiffTarget] = useState<ThreadTurnDiffTarget | null>(null)
  const composerDockRef = useRef<HTMLDivElement>(null)
  const [composerDockHeight, setComposerDockHeight] = useState(208)
  const restoredFailedTurnRef = useRef<string>(undefined)
  const cursorReady = isCursorReady(cursor)
  const claudeReady = isCursorReady(claude)
  const codexReady = isCursorReady(codex)
  const lockedProvider = snapshot?.thread.provider
  const selectedProvider = lockedProvider ?? draftProvider
  const providerReady =
    selectedProvider === "claude"
      ? claudeReady
      : selectedProvider === "codex"
        ? codexReady
        : cursorReady
  const cursorModels = cursor?.models ?? []
  const claudeModels = claude?.models ?? []
  const codexModels = codex?.models ?? []
  const selectedModels =
    selectedProvider === "claude"
      ? claudeModels
      : selectedProvider === "codex"
        ? codexModels
        : cursorModels

  useEffect(() => {
    if (lockedProvider !== undefined) {
      return
    }
    setDraftProvider((current) => {
      const currentReady =
        current === "claude" ? claudeReady : current === "codex" ? codexReady : cursorReady
      if (currentReady) {
        return current
      }
      if (cursorReady) {
        return "cursor"
      }
      if (claudeReady) {
        return "claude"
      }
      if (codexReady) {
        return "codex"
      }
      return current
    })
  }, [lockedProvider, cursorReady, claudeReady, codexReady])
  const subscriptionFailure = useDelayedSubscriptionFailure(subscriptionStatus)
  const searchPaths = useCallback(
    (query: string) =>
      searchWorkspacePaths(projectId, query).then((result) =>
        result.ok ? result.value.entries : [],
      ),
    [projectId],
  )
  const openTicket = useCallback(
    (ticketId: string) => {
      void navigate({
        to: "/projects/$projectId/board",
        params: { projectId },
        search: { ticket: ticketId },
      })
    },
    [navigate, projectId],
  )
  useLayoutEffect(() => {
    if (threadId === undefined) {
      return
    }
    const dock = composerDockRef.current
    if (dock === null) {
      return
    }
    const sync = () => {
      setComposerDockHeight(Math.ceil(dock.getBoundingClientRect().height))
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(dock)
    return () => {
      observer.disconnect()
    }
  }, [threadId])
  const pageSnapshot =
    snapshot !== undefined && snapshot.thread.id === threadId ? snapshot : undefined
  const snapshotWorktreePath =
    pageSnapshot === undefined ? null : threadWorktreePathOf(pageSnapshot.thread)
  const gitStatus = useVcsStatus(
    threadId === undefined
      ? null
      : vcsScopeForThread(projectId, { id: threadId, worktreePath: snapshotWorktreePath }),
  )
  const displayedPr = displayedThreadPr({
    thread: {
      branch: pageSnapshot === undefined ? baseBranch : threadBranchOf(pageSnapshot.thread),
      worktreePath: snapshotWorktreePath,
    },
    gitStatus,
    snapshot: undefined,
  })
  const conflictingPr = isConflictingOpenPullRequest(displayedPr) ? displayedPr : null
  const failingCiPr = isFailingCiOpenPullRequest(displayedPr) ? displayedPr : null
  const retryMandate = retryableFailedTurnMandate({
    resumeCursor: pageSnapshot?.session?.resumeCursor,
    sessionStatus: pageSnapshot?.session?.status,
    transcript: pageSnapshot?.transcript ?? [],
  })

  useEffect(() => {
    setTurnDiffTarget(null)
    if (threadId === undefined) {
      createdThreadIdRef.current = undefined
      clearCreatedCheckout()
      setLoading(false)
      setSubscriptionStatus(undefined)
      const draftCheckout = draftCheckoutOf(getThreadEnvModePreference())
      setEnvMode(draftCheckout.envMode)
      setBaseBranch(null)
      setStartFromOrigin(draftCheckout.startFromOrigin)
      return
    }
    const cached = getThreadSnapshot(threadId)
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
      if (next.thread.id !== threadId) {
        return
      }
      replaceThreadSnapshot(next)
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
    clearAssistantPaint()
    const unsubscribe = subscribeThread(threadId, cached?.snapshotSequence, {
      onSnapshot: (next) => {
        commitSnapshot(next)
      },
      onLive: (live) => {
        if (live.threadId === threadId) {
          pushAssistantLive(live)
        }
      },
      onEvent: (envelope) => {
        const event = envelope.event
        reduceThreadSnapshotEnvelope(threadId, envelope)
        if ("threadId" in event && event.threadId !== threadId) {
          return
        }
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
      clearAssistantPaint(threadId)
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

  useThreadVisitTracking(threadId, latestTurnCompletedAt)

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
      !providerReady
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
          provider: selectedProvider,
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
        publishCreatedThread(
          makeOptimisticThreadShell({
            id: result.threadId,
            projectId: submittedProjectId,
            title: seedTitleFromTurn(
              prompt,
              submittedImages.map((image) => image.upload),
            ),
            runtimeMode,
            provider: selectedProvider,
            branch: baseBranch,
          }),
        )
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

  const submitPresentedTurn = (presentation: TurnPresentation, prompt: string) => {
    if (threadId === undefined || isRunning || project?.available !== true || !providerReady) {
      return
    }
    setComposerFailure(undefined)
    setOptimisticSend({ threadId, startedAtMs: Date.now() })
    setFollowLatestKey((current) => current + 1)
    const input = {
      projectId,
      threadId,
      prompt,
      titleSeed: turnPresentationLabel(presentation),
      presentation,
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

  const submitFixMergeConflicts = () => {
    if (conflictingPr === null) {
      return
    }
    submitPresentedTurn(
      FIX_MERGE_CONFLICTS_PRESENTATION,
      buildFixMergeConflictsPrompt(conflictingPr),
    )
  }

  const submitFixCi = () => {
    if (failingCiPr === null) {
      return
    }
    submitPresentedTurn(FIX_CI_PRESENTATION, buildFixCiPrompt(failingCiPr))
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
      disabled={awaitingThread || project?.available !== true || !providerReady}
      text={text}
      images={images}
      runtimeMode={runtimeMode}
      models={selectedModels}
      cursorModels={cursorModels}
      claudeModels={claudeModels}
      codexModels={codexModels}
      lockedProvider={lockedProvider}
      selectedProvider={selectedProvider}
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
      onProviderChange={setDraftProvider}
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
        isNewThread || (conflictingPr === null && failingCiPr === null) ? undefined : (
          <>
            {conflictingPr === null ? null : (
              <FixMergeConflictsButton
                disabled={
                  awaitingThread || project?.available !== true || !providerReady || isRunning
                }
                onClick={submitFixMergeConflicts}
              />
            )}
            {failingCiPr === null ? null : (
              <FixCiButton
                disabled={
                  awaitingThread || project?.available !== true || !providerReady || isRunning
                }
                onClick={submitFixCi}
              />
            )}
          </>
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
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <ThreadTranscript
              composerDockHeight={composerDockHeight}
              transcript={pageSnapshot?.transcript ?? []}
              isRunning={isWorking}
              workingStartedAtMs={workingStartedAtMs}
              latestTurn={pageSnapshot?.thread.latestTurn ?? null}
              turns={pageSnapshot?.turns ?? []}
              loading={loading || awaitingThread}
              workspaceRoot={project?.workspaceRoot}
              cwd={
                pageSnapshot === undefined
                  ? project?.workspaceRoot
                  : (threadWorktreePathOf(pageSnapshot.thread) ?? project?.workspaceRoot)
              }
              projectId={projectId}
              tickets={tickets}
              onOpenTicket={openTicket}
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
              onOpenTurnDiff={(openedTurnId, filePath) => {
                if (threadId === undefined) {
                  return
                }
                if (filePath === undefined) {
                  setTurnDiffTarget({ threadId, turnId: openedTurnId })
                  return
                }
                setTurnDiffTarget({ threadId, turnId: openedTurnId, filePath })
              }}
            />
            <div
              ref={composerDockRef}
              className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
            >
              <div className="pointer-events-auto">{composer}</div>
            </div>
          </div>
          <ThreadTurnDiffPanel target={turnDiffTarget} onClose={() => setTurnDiffTarget(null)} />
        </>
      )}
    </main>
  )
}
