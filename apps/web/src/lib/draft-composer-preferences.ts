import type { Provider } from "@noyau/contracts/entities/environment"
import type { ModelSelection } from "@noyau/contracts/entities/model-selection"
import type { RuntimeMode } from "@noyau/contracts/entities/runtime-mode"
import type { ProjectId, ThreadId } from "@noyau/contracts/ids"

import { composerDraftStoreKey } from "@/lib/composer-drafts"

export type DraftComposerPreferences = {
  readonly provider: Provider
  readonly modelSelection: ModelSelection | null
  readonly runtimeMode: RuntimeMode
}

const preferencesByDraft = new Map<string, DraftComposerPreferences>()

export const peekDraftComposerPreferences = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): DraftComposerPreferences | undefined =>
  preferencesByDraft.get(composerDraftStoreKey(projectId, threadId))

export const rememberDraftComposerPreferences = (input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly preferences: DraftComposerPreferences
}): void => {
  preferencesByDraft.set(composerDraftStoreKey(input.projectId, input.threadId), input.preferences)
}

export const promoteDraftComposerPreferences = (projectId: ProjectId, threadId: ThreadId): void => {
  const fromKey = composerDraftStoreKey(projectId, undefined)
  const toKey = composerDraftStoreKey(projectId, threadId)
  const preferences = preferencesByDraft.get(fromKey)
  if (preferences === undefined || preferencesByDraft.has(toKey)) {
    return
  }
  preferencesByDraft.delete(fromKey)
  preferencesByDraft.set(toKey, preferences)
}

export const clearDraftComposerPreferences = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): void => {
  preferencesByDraft.delete(composerDraftStoreKey(projectId, threadId))
}

export const resetDraftComposerPreferences = (): void => {
  preferencesByDraft.clear()
}
