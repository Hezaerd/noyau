import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { useCallback } from "react"

import { useAppAtomValue } from "@/hooks/use-app-atom"
import {
  composerDraftStoreKey,
  projectNewThreadDrafts,
  type NewThreadDraft,
  type NewThreadDraftId,
} from "@/lib/composer-drafts"
import type { ComposerImage } from "@/lib/composer-images"
import {
  clearComposerDraft,
  composerDraftsAtom,
  draftAtom,
  writeComposerDraft,
  writeComposerDraftImages,
} from "@/state/composer-drafts"

export interface ComposerDraft {
  readonly text: string
  readonly images: ReadonlyArray<ComposerImage>
  readonly setText: (text: string) => void
  readonly setImages: (images: ReadonlyArray<ComposerImage>) => void
  readonly clear: () => void
}

export function useProjectNewThreadDrafts(
  projectId: ProjectId | undefined,
): ReadonlyArray<NewThreadDraft<ComposerImage>> {
  const drafts = useAppAtomValue(composerDraftsAtom)
  return projectId === undefined ? [] : projectNewThreadDrafts(drafts, projectId)
}

export function useComposerDraft(
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  draftId?: NewThreadDraftId,
): ComposerDraft {
  const draft = useAppAtomValue(draftAtom(composerDraftStoreKey(projectId, threadId, draftId)))
  const setText = useCallback(
    (next: string) => {
      writeComposerDraft(projectId, threadId, next, draftId)
    },
    [draftId, projectId, threadId],
  )
  const setImages = useCallback(
    (next: ReadonlyArray<ComposerImage>) => {
      writeComposerDraftImages(projectId, threadId, next, draftId)
    },
    [draftId, projectId, threadId],
  )
  const clear = useCallback(() => {
    clearComposerDraft(projectId, threadId, draftId)
  }, [draftId, projectId, threadId])

  return { text: draft.text, images: draft.images, setText, setImages, clear }
}
