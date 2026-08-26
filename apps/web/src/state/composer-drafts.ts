import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { Atom } from "effect/unstable/reactivity"

import {
  composerDraftStoreKey,
  emptyComposerDraft,
  isComposerDraftEmpty,
  persistComposerDrafts,
  readStoredComposerDrafts,
  sessionDraftsFromStoredTexts,
  storedTextsFromSessionDrafts,
  type ComposerDraftSessionValue,
} from "@/lib/composer-drafts"
import { revokeComposerImages, type ComposerImage } from "@/lib/composer-images"
import { appAtomRegistry } from "@/state/atom-registry"
import { persistWritableAtom } from "@/state/persist"

export type ComposerDraftValue = ComposerDraftSessionValue<ComposerImage>
export type ComposerDraftsState = ReadonlyMap<string, ComposerDraftValue>

export const composerDraftsAtom = Atom.make<ComposerDraftsState>(new Map()).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:composer-drafts"),
)

export const draftAtom = Atom.family((key: string) =>
  Atom.make(
    (get): ComposerDraftValue => get(composerDraftsAtom).get(key) ?? emptyComposerDraft,
  ).pipe(Atom.withLabel(`chrome:draft:${key}`)),
)

let initialized = false

export const initializeComposerDrafts = (): void => {
  if (initialized) {
    return
  }
  initialized = true
  persistWritableAtom(composerDraftsAtom, {
    read: () => sessionDraftsFromStoredTexts<ComposerImage>(readStoredComposerDrafts()),
    write: (drafts) => {
      persistComposerDrafts(storedTextsFromSessionDrafts(drafts))
    },
  })
}

const readDraft = (projectId: ProjectId, threadId: ThreadId | undefined): ComposerDraftValue =>
  appAtomRegistry.get(draftAtom(composerDraftStoreKey(projectId, threadId)))

export const readComposerDraft = (projectId: ProjectId, threadId: ThreadId | undefined): string =>
  readDraft(projectId, threadId).text

export const readComposerDraftImages = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): ReadonlyArray<ComposerImage> => readDraft(projectId, threadId).images

const writeDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  nextDraft: ComposerDraftValue,
): void => {
  const key = composerDraftStoreKey(projectId, threadId)
  const current = appAtomRegistry.get(composerDraftsAtom)
  const existing = current.get(key)
  if (isComposerDraftEmpty(nextDraft)) {
    if (existing === undefined) {
      return
    }
    const next = new Map(current)
    next.delete(key)
    appAtomRegistry.set(composerDraftsAtom, next)
    return
  }
  if (existing?.text === nextDraft.text && existing.images === nextDraft.images) {
    return
  }
  const next = new Map(current)
  next.set(key, nextDraft)
  appAtomRegistry.set(composerDraftsAtom, next)
}

export const writeComposerDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  text: string,
): void => {
  writeDraft(projectId, threadId, { text, images: readDraft(projectId, threadId).images })
}

export const writeComposerDraftImages = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  images: ReadonlyArray<ComposerImage>,
): void => {
  writeDraft(projectId, threadId, { text: readDraft(projectId, threadId).text, images })
}

export const clearComposerDraft = (projectId: ProjectId, threadId: ThreadId | undefined): void => {
  writeDraft(projectId, threadId, emptyComposerDraft)
}

/** Move a leftover new-Thread Brouillon onto the created Thread. */
export const promoteComposerDraft = (projectId: ProjectId, threadId: ThreadId): void => {
  const fromKey = composerDraftStoreKey(projectId, undefined)
  const toKey = composerDraftStoreKey(projectId, threadId)
  const current = appAtomRegistry.get(composerDraftsAtom)
  const from = current.get(fromKey)
  const to = current.get(toKey)
  if (
    from === undefined ||
    isComposerDraftEmpty(from) ||
    (to !== undefined && !isComposerDraftEmpty(to))
  ) {
    return
  }
  const next = new Map(current)
  next.delete(fromKey)
  next.set(toKey, from)
  appAtomRegistry.set(composerDraftsAtom, next)
}

export const resetComposerDrafts = (): void => {
  const current = appAtomRegistry.get(composerDraftsAtom)
  if (current.size === 0) {
    return
  }
  for (const draft of current.values()) {
    revokeComposerImages(draft.images)
  }
  appAtomRegistry.set(composerDraftsAtom, new Map())
}
