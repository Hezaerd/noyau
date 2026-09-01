import { useAtomSet } from "@effect/atom-react"
import type { ThreadEnvMode } from "@noyau/contracts/entities/checkout"
import { threadBranchOf, threadWorktreePathOf } from "@noyau/contracts/entities/checkout"
import { DEFAULT_PROVIDER_INSTANCE_ID, type Provider } from "@noyau/contracts/entities/environment"
import type {
  DefaultModelSelection,
  ModelSelection,
} from "@noyau/contracts/entities/model-selection"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type { ThreadSnapshot } from "@noyau/contracts/entities/thread-snapshot"
import type { TurnPresentation } from "@noyau/contracts/entities/transcript"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { isResumePrompt } from "@noyau/shared/resume-prompt"
import { useNavigate } from "@tanstack/react-router"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
import { useAppAtomValue } from "@/hooks/use-app-atom"
import { useComposerDraft } from "@/hooks/use-composer-draft"
import { useProjects, useProviders, useThreadShell } from "@/hooks/use-control-plane"
import { useDelayedSubscriptionFailure } from "@/hooks/use-delayed-subscription-failure"
import { useProjectComposerTickets } from "@/hooks/use-project-composer-tickets"
import { useThreadSnapshot } from "@/hooks/use-thread-snapshot"
import { useThreadVisitTracking } from "@/hooks/use-thread-visit-tracking"
import { useVcsStatus } from "@/hooks/use-vcs-status"
import { invalidInputFailure } from "@/lib/app-failure"
import { clearAssistantPaint, pushAssistantLive } from "@/lib/assistant-paint"
import {
  clearCreatedCheckout,
  clearDraftCheckout,
  draftCheckoutOf,
  envModeLockedOf,
  peekCreatedCheckout,
  peekDraftCheckout,
  rememberCreatedCheckout,
  rememberDraftCheckout,
  resolveEffectiveEnvMode,
  resolveOpenedThreadCheckout,
  type OpenedThreadCheckout,
} from "@/lib/checkout"
import type { NewThreadDraftId } from "@/lib/composer-drafts"
import {
  appendComposerImages,
  composerImageFailureMessage,
  filesFromClipboard,
  filesFromFileList,
  revokeComposerImages,
  type ComposerImage,
} from "@/lib/composer-images"
import { loadComposerImagesFromAttachments } from "@/lib/composer-images-from-attachments"
import {
  buildAndDispatchCommand,
  searchWorkspacePaths,
  type SubscriptionStatus,
} from "@/lib/control-plane"
import { makeOptimisticThreadShell } from "@/lib/control-plane-state"
import {
  clearDraftComposerPreferences,
  peekDraftComposerPreferences,
  promoteDraftComposerPreferences,
  rememberDraftComposerPreferences,
} from "@/lib/draft-composer-preferences"
import { isDraftThreadView, resolveDraftLatestTurn } from "@/lib/draft-thread"
import { presentFailure, type FailurePresentation } from "@/lib/failure-presentation"
import { resolveDraftDefaultModelSelection } from "@/lib/model-picker-preferences"
import { makeProjectDefaultModelUpdateRequest } from "@/lib/project-commands"
import {
  isProviderInstanceReady,
  modelsByProvider,
  readyProviderIds,
} from "@/lib/provider-presentation"
import {
  clearOptimisticSend,
  peekOptimisticSend,
  rememberOptimisticSend,
  resolveOpenThreadWorking,
  type OptimisticSend,
} from "@/lib/thread-activity"
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
import { removeComposerDraftImageAtom, replaceComposerDraftAtom } from "@/state/composer-drafts"
import { getThreadEnvModePreference } from "@/state/preferences"
import { publishCreatedThread } from "@/state/shell"
import { threadComposerOpenByIdAtom } from "@/state/thread-composer"
import { getThreadSnapshot, threadSnapshotNeedsLoad } from "@/state/thread-snapshot"
import { retainThreadSnapshotSubscription } from "@/state/thread-snapshot-subscriptions"

interface ThreadPageProps {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly draftId?: NewThreadDraftId | undefined
  readonly onCreated: (threadId: ThreadId) => void
  readonly onSelectProject: (projectId: ProjectId) => void
}

const sameDefaultModelSelection = (
  left: DefaultModelSelection | null,
  right: DefaultModelSelection | null,
): boolean =>
  left?.provider === right?.provider &&
  left?.modelSelection.modelId === right?.modelSelection.modelId &&
  left?.modelSelection.reasoningEffort === right?.modelSelection.reasoningEffort &&
  left?.modelSelection.serviceTier === right?.modelSelection.serviceTier &&
  left?.modelSelection.thinking === right?.modelSelection.thinking

const openedCheckoutOf = (input: {
  readonly threadId: ThreadId | undefined
  readonly worktreePath: string | null
  readonly threadBranch: string | null
  readonly latestTurn: { readonly turnId: string } | null | undefined
}): OpenedThreadCheckout => {
  if (input.threadId === undefined) {
    const draft = draftCheckoutOf(getThreadEnvModePreference())
    return { ...draft, baseBranch: null }
  }
  const checkout = resolveOpenedThreadCheckout({
    worktreePath: input.worktreePath,
    threadBranch: input.threadBranch,
    latestTurn: input.latestTurn,
    pending: peekCreatedCheckout(input.threadId),
    preferredEnvMode: getThreadEnvModePreference(),
  })
  if (input.worktreePath === null && input.latestTurn === null) {
    rememberCreatedCheckout({ threadId: input.threadId, ...checkout })
  }
  return checkout
}

export function ThreadPage({
  projectId,
  threadId,
  draftId,
  onCreated,
  onSelectProject,
}: ThreadPageProps) {
  const providers = useProviders()
  const projects = useProjects()
  const navigate = useNavigate()
  const tickets = useProjectComposerTickets(projectId)
  const project = projects.find((candidate) => candidate.id === projectId)
  const snapshot = useThreadSnapshot(threadId)
  const shellThread = useThreadShell(threadId)
  const shellThreadRef = useRef(shellThread)
  shellThreadRef.current = shellThread
  const [loading, setLoading] = useState(() => threadSnapshotNeedsLoad(threadId))
  const [actionFailure, setActionFailure] = useState<FailurePresentation>()
  const [composerFailure, setComposerFailure] = useState<FailurePresentation>()
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>()
  const {
    text,
    images,
    setText,
    setImages,
    clear: clearDraft,
  } = useComposerDraft(projectId, threadId, draftId)
  const replaceDraft = useAtomSet(replaceComposerDraftAtom)
  const removeDraftImage = useAtomSet(removeComposerDraftImageAtom)
  const initialComposerPreferences = useState(() =>
    peekDraftComposerPreferences(projectId, threadId, draftId),
  )[0]
  const initialCheckout = useState(() => {
    const rememberedDraft =
      threadId === undefined ? peekDraftCheckout(projectId, draftId) : undefined
    if (rememberedDraft !== undefined) {
      return rememberedDraft
    }
    const cached = threadId === undefined ? undefined : getThreadSnapshot(threadId)
    return openedCheckoutOf({
      threadId,
      worktreePath: threadWorktreePathOf(cached?.thread ?? shellThread ?? {}),
      threadBranch: threadBranchOf(cached?.thread ?? shellThread ?? {}),
      latestTurn: cached?.thread.latestTurn ?? shellThread?.latestTurn,
    })
  })[0]
  const [envMode, setEnvMode] = useState<ThreadEnvMode>(initialCheckout.envMode)
  const [baseBranch, setBaseBranch] = useState<string | null>(initialCheckout.baseBranch)
  const [startFromOrigin, setStartFromOrigin] = useState(initialCheckout.startFromOrigin)
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(
    initialComposerPreferences?.runtimeMode ?? "full-access",
  )
  const [modelSelection, setModelSelection] = useState<ModelSelection | null>(
    initialComposerPreferences?.modelSelection ?? null,
  )
  const [defaultModelSelection, setDefaultModelSelection] = useState<DefaultModelSelection | null>(
    null,
  )
  const defaultModelMutationRevisionRef = useRef(0)
  const pendingDefaultModelSelectionRef = useRef<DefaultModelSelection | null | undefined>(
    undefined,
  )
  const persistedDefaultModelSelectionRef = useRef<DefaultModelSelection | null>(null)
  const [draftProvider, setDraftProvider] = useState<Provider>(
    initialComposerPreferences?.provider ?? DEFAULT_PROVIDER_INSTANCE_ID,
  )
  const draftProviderRef = useRef(draftProvider)
  draftProviderRef.current = draftProvider
  const [draftByRequest, setDraftByRequest] = useState<Record<string, DraftAnswers>>({})
  const [legacyFreeformByRequest, setLegacyFreeformByRequest] = useState<Record<string, string>>({})
  const [optimisticSend, setOptimisticSendState] = useState<OptimisticSend | null>(() =>
    peekOptimisticSend(threadId),
  )
  const writeOptimisticSend = useCallback(
    (send: OptimisticSend | null) => {
      if (send?.threadId !== undefined) {
        rememberOptimisticSend(send)
      } else if (threadId !== undefined) {
        clearOptimisticSend(threadId)
      }
      setOptimisticSendState(send)
    },
    [threadId],
  )
  const [followLatestKey, setFollowLatestKey] = useState(0)
  const [turnDiffTarget, setTurnDiffTarget] = useState<ThreadTurnDiffTarget | null>(null)
  const composerDockRef = useRef<HTMLDivElement>(null)
  const [composerDockHeight, setComposerDockHeight] = useState(208)
  const composerOpenById = useAppAtomValue(threadComposerOpenByIdAtom)
  const composerOpen = threadId === undefined ? true : (composerOpenById.get(threadId) ?? true)
  const restoredFailedTurnRef = useRef<string>(undefined)
  const lockedProvider = snapshot?.thread.provider
  const selectedProvider = lockedProvider ?? draftProvider
  const selectedInstance = providers[selectedProvider]
  const providerReady = isProviderInstanceReady(selectedInstance)
  const providerDisabled = selectedInstance !== undefined && !selectedInstance.enabled
  const catalogs = useMemo(() => modelsByProvider(providers), [providers])
  const availableProviders = useMemo(() => readyProviderIds(providers), [providers])
  const selectedModels = catalogs[selectedProvider] ?? []

  useEffect(() => {
    const persisted = project?.defaultModelSelection ?? null
    persistedDefaultModelSelectionRef.current = persisted
    const pending = pendingDefaultModelSelectionRef.current
    if (pending === undefined || sameDefaultModelSelection(pending, persisted)) {
      pendingDefaultModelSelectionRef.current = undefined
      setDefaultModelSelection(persisted)
    }
  }, [project?.defaultModelSelection])

  const initializedDraftModelRef = useRef<ProjectId>(
    initialComposerPreferences === undefined ? undefined : projectId,
  )
  useEffect(() => {
    if (
      threadId !== undefined ||
      project === undefined ||
      initializedDraftModelRef.current === projectId
    ) {
      return
    }
    const resolved = resolveDraftDefaultModelSelection({
      stored: project.defaultModelSelection,
      availableProviders,
      modelsByProvider: catalogs,
    })
    if (resolved === null) return
    initializedDraftModelRef.current = projectId
    setDraftProvider(resolved.provider)
    setModelSelection(resolved.modelSelection)
  }, [availableProviders, catalogs, project, projectId, threadId])

  useEffect(() => {
    if (lockedProvider !== undefined) {
      return
    }
    if (isProviderInstanceReady(providers[draftProvider])) {
      return
    }
    const next = availableProviders[0]
    if (next === undefined || next === draftProvider) {
      return
    }
    const catalog = catalogs[next] ?? []
    setDraftProvider(next)
    setModelSelection((selection) =>
      selection !== null && catalog.some((model) => model.modelId === selection.modelId)
        ? selection
        : null,
    )
  }, [lockedProvider, draftProvider, providers, availableProviders, catalogs])
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
    if (threadId === undefined || !composerOpen) {
      setComposerDockHeight(0)
      return
    }
    const dock = composerDockRef.current
    if (dock === null) {
      setComposerDockHeight(0)
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
  }, [composerOpen, threadId])
  const pageSnapshot =
    snapshot !== undefined && snapshot.thread.id === threadId ? snapshot : undefined
  const isDraftThread = isDraftThreadView({
    threadId,
    latestTurn: resolveDraftLatestTurn(
      pageSnapshot?.thread.latestTurn,
      shellThread?.latestTurn,
      pageSnapshot !== undefined,
    ),
    transcriptLength: pageSnapshot?.transcript.length ?? 0,
    sending: optimisticSend !== null,
  })
  const snapshotWorktreePath =
    pageSnapshot === undefined ? null : threadWorktreePathOf(pageSnapshot.thread)

  useEffect(() => {
    if (!isDraftThread) {
      return
    }
    if (threadId === undefined) {
      rememberDraftCheckout({
        projectId,
        draftId,
        checkout: { envMode, baseBranch, startFromOrigin },
      })
      return
    }
    rememberCreatedCheckout({
      threadId,
      envMode,
      baseBranch,
      startFromOrigin,
    })
  }, [baseBranch, draftId, envMode, isDraftThread, projectId, startFromOrigin, threadId])
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
      setLoading(false)
      setSubscriptionStatus(undefined)
      const draftCheckout =
        peekDraftCheckout(projectId, draftId) ??
        openedCheckoutOf({
          threadId,
          worktreePath: null,
          threadBranch: null,
          latestTurn: null,
        })
      setEnvMode(draftCheckout.envMode)
      setBaseBranch(draftCheckout.baseBranch)
      setStartFromOrigin(draftCheckout.startFromOrigin)
      return
    }
    const cached = getThreadSnapshot(threadId)
    const rememberedPreferences = peekDraftComposerPreferences(projectId, threadId, draftId)
    const cachedIsDraft =
      cached !== undefined && cached.thread.latestTurn === null && cached.transcript.length === 0
    const opened = openedCheckoutOf({
      threadId,
      worktreePath: threadWorktreePathOf(cached?.thread ?? shellThreadRef.current ?? {}),
      threadBranch: threadBranchOf(cached?.thread ?? shellThreadRef.current ?? {}),
      latestTurn: cached?.thread.latestTurn ?? shellThreadRef.current?.latestTurn,
    })
    setEnvMode(opened.envMode)
    setBaseBranch(opened.baseBranch)
    setStartFromOrigin(opened.startFromOrigin)
    setLoading(threadSnapshotNeedsLoad(threadId))
    setSubscriptionStatus(undefined)
    if (cached !== undefined) {
      setRuntimeMode(
        cachedIsDraft && rememberedPreferences !== undefined
          ? rememberedPreferences.runtimeMode
          : cached.thread.runtimeMode,
      )
      setModelSelection(
        cachedIsDraft && rememberedPreferences !== undefined
          ? rememberedPreferences.modelSelection
          : cached.thread.modelSelection,
      )
    } else {
      setRuntimeMode(rememberedPreferences?.runtimeMode ?? "full-access")
      setModelSelection(rememberedPreferences?.modelSelection ?? null)
    }
    const commitSnapshot = (next: ThreadSnapshot) => {
      if (next.thread.id !== threadId) {
        return
      }
      const remembered = peekDraftComposerPreferences(projectId, threadId, draftId)
      const nextIsDraft = next.thread.latestTurn === null && next.transcript.length === 0
      setRuntimeMode(
        nextIsDraft && remembered !== undefined ? remembered.runtimeMode : next.thread.runtimeMode,
      )
      setModelSelection(
        nextIsDraft && remembered !== undefined
          ? remembered.modelSelection
          : next.thread.modelSelection,
      )
      if (!nextIsDraft) {
        clearDraftComposerPreferences(projectId, threadId, draftId)
      }
      const boundPath = threadWorktreePathOf(next.thread)
      const nextCheckout = openedCheckoutOf({
        threadId: next.thread.id,
        worktreePath: boundPath,
        threadBranch: threadBranchOf(next.thread),
        latestTurn: next.thread.latestTurn,
      })
      setEnvMode(nextCheckout.envMode)
      setStartFromOrigin(nextCheckout.startFromOrigin)
      if (nextCheckout.baseBranch !== null) {
        setBaseBranch(nextCheckout.baseBranch)
      }
      if (boundPath !== null) {
        clearCreatedCheckout(next.thread.id)
      }
      setLoading(false)
      setActionFailure(undefined)
    }
    clearAssistantPaint()
    const unsubscribe = retainThreadSnapshotSubscription(threadId, {
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
    }
  }, [draftId, projectId, threadId])

  const { isAuthoritativeWorking: isRunning, isWorking } = resolveOpenThreadWorking({
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
      writeOptimisticSend(null)
    }
  }, [isWorking, writeOptimisticSend])

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
    const attachments = retryMandate.attachments
    let cancelled = false
    void (
      attachments === undefined || attachments.length === 0
        ? Promise.resolve([])
        : loadComposerImagesFromAttachments(attachments)
    ).then((nextImages) => {
      if (cancelled) {
        revokeComposerImages(nextImages)
        return undefined
      }
      replaceDraft({
        projectId,
        threadId,
        draftId,
        text: mandateText,
        images: nextImages,
      })
      return undefined
    })
    return () => {
      cancelled = true
    }
  }, [draftId, images.length, projectId, replaceDraft, retryMandate, text, threadId])

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
    const submittedDraftId = draftId
    if (
      envMode === "worktree" &&
      snapshotWorktreePath === null &&
      (baseBranch === null || baseBranch.trim() === "")
    ) {
      setComposerFailure(
        presentFailure(invalidInputFailure("Choose a base branch before sending."), {
          operation: "thread.turn.start",
          scope: "field",
          initiatedByUser: true,
          hasUsableData: snapshot !== undefined,
        }),
      )
      return
    }
    clearDraft()
    setComposerFailure(undefined)
    const startedAtMs = Date.now()
    writeOptimisticSend({ threadId, startedAtMs })
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
        replaceDraft({
          projectId: submittedProjectId,
          threadId: submittedThreadId,
          draftId: submittedDraftId,
          text: submittedText,
          images: submittedImages,
        })
        writeOptimisticSend(null)
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
        replaceDraft({
          projectId: submittedProjectId,
          threadId: submittedThreadId,
          draftId: submittedDraftId,
          text: submittedText,
          images: submittedImages,
        })
        writeOptimisticSend(null)
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
        writeOptimisticSend({
          threadId: result.threadId,
          startedAtMs,
        })
        rememberCreatedCheckout({
          threadId: result.threadId,
          envMode,
          baseBranch,
          startFromOrigin,
        })
        clearDraftCheckout(submittedProjectId, submittedDraftId)
        promoteDraftComposerPreferences(submittedProjectId, result.threadId, submittedDraftId)
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
          submittedDraftId,
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
      replaceDraft({
        projectId,
        threadId,
        draftId,
        text: mandateText,
        images: nextImages,
      })
      dispatchTurn(mandateText, nextImages, threadId)
      return undefined
    })
  }

  const submitPresentedTurn = (presentation: TurnPresentation, prompt: string) => {
    if (threadId === undefined || isRunning || project?.available !== true || !providerReady) {
      return
    }
    setComposerFailure(undefined)
    writeOptimisticSend({ threadId, startedAtMs: Date.now() })
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
        writeOptimisticSend(null)
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
        writeOptimisticSend(null)
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
    if (isDraftThread) {
      rememberDraftComposerPreferences({
        projectId,
        threadId,
        draftId,
        preferences: {
          provider: draftProviderRef.current,
          modelSelection: nextSelection,
          runtimeMode,
        },
      })
    }
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

  const changeRuntimeMode = (nextRuntimeMode: RuntimeMode) => {
    setRuntimeMode(nextRuntimeMode)
    if (!isDraftThread) {
      return
    }
    rememberDraftComposerPreferences({
      projectId,
      threadId,
      draftId,
      preferences: {
        provider: draftProviderRef.current,
        modelSelection,
        runtimeMode: nextRuntimeMode,
      },
    })
  }

  const changeDraftProvider = (nextProvider: Provider) => {
    draftProviderRef.current = nextProvider
    setDraftProvider(nextProvider)
    if (!isDraftThread) {
      return
    }
    rememberDraftComposerPreferences({
      projectId,
      threadId,
      draftId,
      preferences: {
        provider: nextProvider,
        modelSelection,
        runtimeMode,
      },
    })
  }

  const changeDefaultModelSelection = (nextSelection: DefaultModelSelection | null) => {
    const revision = defaultModelMutationRevisionRef.current + 1
    defaultModelMutationRevisionRef.current = revision
    pendingDefaultModelSelectionRef.current = nextSelection
    setDefaultModelSelection(nextSelection)
    setComposerFailure(undefined)
    void buildAndDispatchCommand(
      makeProjectDefaultModelUpdateRequest({ projectId, defaultModelSelection: nextSelection }),
    ).then((result) => {
      if (!result.ok && revision === defaultModelMutationRevisionRef.current) {
        pendingDefaultModelSelectionRef.current = undefined
        setDefaultModelSelection(persistedDefaultModelSelectionRef.current)
        setComposerFailure(
          presentFailure(result.failure, {
            operation: "project.meta.update",
            scope: "field",
            initiatedByUser: true,
            hasUsableData: true,
          }),
        )
      }
      return undefined
    })
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
  const composerError = composerFailure ?? (isDraftThread ? actionFailure : undefined)
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
    if (threadId !== undefined && worktreePath === null) {
      rememberCreatedCheckout({
        threadId,
        envMode: mode,
        baseBranch,
        startFromOrigin: mode === "worktree",
      })
    }
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
      modelsByProvider={catalogs}
      availableProviders={availableProviders}
      lockedProvider={lockedProvider}
      selectedProvider={selectedProvider}
      modelSelection={modelSelection}
      defaultModelSelection={defaultModelSelection}
      placement={isDraftThread ? "hero" : "docked"}
      error={
        providerDisabled ? (
          <span className="text-xs text-muted-foreground">
            This provider is disabled in Settings.
          </span>
        ) : composerError === undefined ? undefined : (
          <InlineFailure className="text-xs" presentation={composerError} />
        )
      }
      onSubmit={submitTurn}
      onTextChange={(value) => {
        setText(value)
        setComposerFailure(undefined)
      }}
      onRuntimeModeChange={changeRuntimeMode}
      onModelSelectionChange={changeModelSelection}
      onDefaultModelSelectionChange={changeDefaultModelSelection}
      onProviderChange={changeDraftProvider}
      onPaste={acceptImages}
      onDrop={acceptImages}
      onImageRemove={(localId) => {
        removeDraftImage({ projectId, threadId, draftId, localId })
        setComposerFailure(undefined)
      }}
      onInterrupt={() => interruptTurn()}
      searchPaths={searchPaths}
      tickets={tickets}
      contextUsage={pageSnapshot?.thread.contextUsage}
      toolbar={
        isDraftThread || (conflictingPr === null && failingCiPr === null) ? undefined : (
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
      {isDraftThread ? (
        <ThreadDraftHero
          projectName={project?.name}
          projects={projects}
          selectedProjectId={projectId}
          onSelectProject={onSelectProject}
        >
          {composerOpen ? composer : null}
        </ThreadDraftHero>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ThreadTranscript
              composerDockHeight={composerDockHeight}
              transcript={pageSnapshot?.transcript ?? []}
              isRunning={isWorking}
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
              {...(threadId === undefined ? {} : { scrollerKey: threadId })}
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
            {composerOpen ? (
              <div
                ref={composerDockRef}
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
              >
                <div className="pointer-events-auto">{composer}</div>
              </div>
            ) : null}
          </div>
          <ThreadTurnDiffPanel target={turnDiffTarget} onClose={() => setTurnDiffTarget(null)} />
        </div>
      )}
    </main>
  )
}
