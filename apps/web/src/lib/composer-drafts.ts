import type { ProjectId, ThreadId } from "@noyau/protocol/ids"

const drafts = new Map<string, string>()
const listeners = new Set<() => void>()

export const composerDraftStoreKey = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): string => (threadId === undefined ? `new:${projectId}` : `thread:${threadId}`)

const emitChange = (): void => {
  for (const listener of listeners) {
    listener()
  }
}

export const readComposerDraft = (projectId: ProjectId, threadId: ThreadId | undefined): string =>
  drafts.get(composerDraftStoreKey(projectId, threadId)) ?? ""

export const writeComposerDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  text: string,
): void => {
  const key = composerDraftStoreKey(projectId, threadId)
  if (text === "") {
    if (!drafts.has(key)) {
      return
    }
    drafts.delete(key)
    emitChange()
    return
  }
  if (drafts.get(key) === text) {
    return
  }
  drafts.set(key, text)
  emitChange()
}

export const subscribeComposerDrafts = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const resetComposerDrafts = (): void => {
  if (drafts.size === 0) {
    return
  }
  drafts.clear()
  emitChange()
}
