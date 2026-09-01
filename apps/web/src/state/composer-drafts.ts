import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
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
  type NewThreadDraftId,
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

export const emptyDraftAtom = Atom.make<ComposerDraftValue>(emptyComposerDraft).pipe(
  Atom.withLabel("chrome:draft:empty"),
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

const readDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  draftId?: NewThreadDraftId,
): ComposerDraftValue =>
  appAtomRegistry.get(draftAtom(composerDraftStoreKey(projectId, threadId, draftId)))

export const readComposerDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  draftId?: NewThreadDraftId,
): string => readDraft(projectId, threadId, draftId).text

export const readComposerDraftImages = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  draftId?: NewThreadDraftId,
): ReadonlyArray<ComposerImage> => readDraft(projectId, threadId, draftId).images

const writeDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  nextDraft: ComposerDraftValue,
  draftId?: NewThreadDraftId,
): void => {
  const key = composerDraftStoreKey(projectId, threadId, draftId)
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

export type ComposerDraftReplacement = {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly draftId?: NewThreadDraftId | undefined
  readonly text: string
  readonly images: ReadonlyArray<ComposerImage>
}

export const replaceComposerDraft = (input: ComposerDraftReplacement): void => {
  writeDraft(
    input.projectId,
    input.threadId,
    { text: input.text, images: input.images },
    input.draftId,
  )
}

export const replaceComposerDraftAtom = Atom.writable(
  (_get): undefined => undefined,
  (_ctx, input: ComposerDraftReplacement) => {
    replaceComposerDraft(input)
  },
).pipe(Atom.keepAlive, Atom.withLabel("chrome:replace-composer-draft"))

export const writeComposerDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  text: string,
  draftId?: NewThreadDraftId,
): void => {
  replaceComposerDraft({
    projectId,
    threadId,
    draftId,
    text,
    images: readDraft(projectId, threadId, draftId).images,
  })
}

export const writeComposerDraftImages = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  images: ReadonlyArray<ComposerImage>,
  draftId?: NewThreadDraftId,
): void => {
  replaceComposerDraft({
    projectId,
    threadId,
    draftId,
    text: readDraft(projectId, threadId, draftId).text,
    images,
  })
}

export const clearComposerDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  draftId?: NewThreadDraftId,
): void => {
  replaceComposerDraft({
    projectId,
    threadId,
    draftId,
    text: emptyComposerDraft.text,
    images: emptyComposerDraft.images,
  })
}

export type ComposerDraftImageRemoval = {
  readonly projectId: ProjectId
  readonly threadId: ThreadId | undefined
  readonly draftId?: NewThreadDraftId | undefined
  readonly localId: string
}

export const removeComposerDraftImage = (input: ComposerDraftImageRemoval): void => {
  const current = readDraft(input.projectId, input.threadId, input.draftId)
  const removed = current.images.find((image) => image.localId === input.localId)
  if (removed === undefined) {
    return
  }
  revokeComposerImages([removed])
  replaceComposerDraft({
    projectId: input.projectId,
    threadId: input.threadId,
    draftId: input.draftId,
    text: current.text,
    images: current.images.filter((image) => image.localId !== input.localId),
  })
}

export const removeComposerDraftImageAtom = Atom.writable(
  (_get): undefined => undefined,
  (_ctx, input: ComposerDraftImageRemoval) => {
    removeComposerDraftImage(input)
  },
).pipe(Atom.keepAlive, Atom.withLabel("chrome:remove-composer-draft-image"))

/** Move a leftover new-Thread Brouillon onto the created Thread. */
export const promoteComposerDraft = (
  projectId: ProjectId,
  threadId: ThreadId,
  draftId?: NewThreadDraftId,
): void => {
  const fromKey = composerDraftStoreKey(projectId, undefined, draftId)
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
