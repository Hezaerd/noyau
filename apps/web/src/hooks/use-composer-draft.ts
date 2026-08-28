import { useAtomValue } from "@effect/atom-react"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { useCallback } from "react"

import { composerDraftStoreKey } from "@/lib/composer-drafts"
import type { ComposerImage } from "@/lib/composer-images"
import {
  clearComposerDraft,
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

export function useComposerDraft(
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): ComposerDraft {
  const draft = useAtomValue(draftAtom(composerDraftStoreKey(projectId, threadId)))
  const setText = useCallback(
    (next: string) => {
      writeComposerDraft(projectId, threadId, next)
    },
    [projectId, threadId],
  )
  const setImages = useCallback(
    (next: ReadonlyArray<ComposerImage>) => {
      writeComposerDraftImages(projectId, threadId, next)
    },
    [projectId, threadId],
  )
  const clear = useCallback(() => {
    clearComposerDraft(projectId, threadId)
  }, [projectId, threadId])

  return { text: draft.text, images: draft.images, setText, setImages, clear }
}
