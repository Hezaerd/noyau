import type { TranscriptItem, TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  clearTerminalAskQuestionDrafts,
  emptyAskQuestionDraft,
  readAskQuestionDraft,
  writeAskQuestionDraft,
  type AskQuestionDraftValue,
} from "@/lib/ask-question-drafts"

export function useAskQuestionDraft(input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly request: TranscriptUserInput | undefined
  readonly transcript: ReadonlyArray<TranscriptItem>
}) {
  const identity =
    input.threadId === undefined || input.request === undefined
      ? null
      : `${input.projectId}:${input.threadId}:${input.request.requestId}`
  const restored = useMemo(
    () =>
      input.threadId === undefined || input.request === undefined
        ? emptyAskQuestionDraft()
        : readAskQuestionDraft({
            projectId: input.projectId,
            threadId: input.threadId,
            request: input.request,
          }),
    [input.projectId, input.request, input.threadId],
  )
  const [session, setSession] = useState<{ identity: string | null; value: AskQuestionDraftValue }>(
    () => ({ identity, value: restored }),
  )
  const value = session.identity === identity ? session.value : restored

  useEffect(() => {
    setSession({ identity, value: restored })
  }, [identity, restored])

  useEffect(() => {
    if (input.threadId === undefined) return
    clearTerminalAskQuestionDrafts({
      projectId: input.projectId,
      threadId: input.threadId,
      transcript: input.transcript,
    })
  }, [input.projectId, input.threadId, input.transcript])

  const update = useCallback(
    (change: (current: AskQuestionDraftValue) => AskQuestionDraftValue) => {
      const threadId = input.threadId
      const request = input.request
      if (threadId === undefined || request === undefined || identity === null) return
      const next = change(value)
      writeAskQuestionDraft({
        projectId: input.projectId,
        threadId,
        request,
        value: next,
      })
      setSession({ identity, value: next })
    },
    [identity, input.projectId, input.request, input.threadId, value],
  )

  return {
    value,
    setAnswers: useCallback(
      (answers: AskQuestionDraftValue["answers"]) => update((current) => ({ ...current, answers })),
      [update],
    ),
    setLegacyFreeform: useCallback(
      (legacyFreeform: string) => update((current) => ({ ...current, legacyFreeform })),
      [update],
    ),
    setCurrentQuestionIndex: useCallback(
      (currentQuestionIndex: number) => update((current) => ({ ...current, currentQuestionIndex })),
      [update],
    ),
  }
}
