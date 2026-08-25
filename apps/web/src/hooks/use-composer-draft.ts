import { useAtomValue } from "@effect/atom-react"
import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { useCallback } from "react"

import { composerDraftStoreKey } from "@/lib/composer-drafts"
import { draftAtom, writeComposerDraft } from "@/state/composer-drafts"

export interface ComposerDraft {
  readonly text: string
  readonly setText: (text: string) => void
  readonly clear: () => void
}

export function useComposerDraft(
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): ComposerDraft {
  const text = useAtomValue(draftAtom(composerDraftStoreKey(projectId, threadId)))
  const setText = useCallback(
    (next: string) => {
      writeComposerDraft(projectId, threadId, next)
    },
    [projectId, threadId],
  )
  const clear = useCallback(() => {
    writeComposerDraft(projectId, threadId, "")
  }, [projectId, threadId])

  return { text, setText, clear }
}
