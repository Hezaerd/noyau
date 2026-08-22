import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { useCallback, useSyncExternalStore } from "react"

import {
  readComposerDraft,
  subscribeComposerDrafts,
  writeComposerDraft,
} from "@/lib/composer-drafts"

export interface ComposerDraft {
  readonly text: string
  readonly setText: (text: string) => void
  readonly clear: () => void
}

export function useComposerDraft(
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): ComposerDraft {
  const text = useSyncExternalStore(
    subscribeComposerDrafts,
    () => readComposerDraft(projectId, threadId),
    () => "",
  )
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
