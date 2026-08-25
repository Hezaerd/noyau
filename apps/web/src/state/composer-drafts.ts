import type { ProjectId, ThreadId } from "@noyau/protocol/ids"
import { Atom } from "effect/unstable/reactivity"

import { composerDraftStoreKey } from "@/lib/composer-drafts"
import { appAtomRegistry } from "@/state/atom-registry"

export const composerDraftsAtom = Atom.make<ReadonlyMap<string, string>>(new Map()).pipe(
  Atom.keepAlive,
  Atom.withLabel("chrome:composer-drafts"),
)

export const draftAtom = Atom.family((key: string) =>
  Atom.make((get): string => get(composerDraftsAtom).get(key) ?? "").pipe(
    Atom.withLabel(`chrome:draft:${key}`),
  ),
)

export const readComposerDraft = (projectId: ProjectId, threadId: ThreadId | undefined): string =>
  appAtomRegistry.get(draftAtom(composerDraftStoreKey(projectId, threadId)))

export const writeComposerDraft = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
  text: string,
): void => {
  const key = composerDraftStoreKey(projectId, threadId)
  const current = appAtomRegistry.get(composerDraftsAtom)
  if (text === "") {
    if (!current.has(key)) {
      return
    }
    const next = new Map(current)
    next.delete(key)
    appAtomRegistry.set(composerDraftsAtom, next)
    return
  }
  if (current.get(key) === text) {
    return
  }
  const next = new Map(current)
  next.set(key, text)
  appAtomRegistry.set(composerDraftsAtom, next)
}

/** Move a leftover new-Thread Brouillon onto the created Thread. */
export const promoteComposerDraft = (projectId: ProjectId, threadId: ThreadId): void => {
  const fromKey = composerDraftStoreKey(projectId, undefined)
  const toKey = composerDraftStoreKey(projectId, threadId)
  const current = appAtomRegistry.get(composerDraftsAtom)
  const text = current.get(fromKey) ?? ""
  if (text === "" || (current.get(toKey) ?? "") !== "") {
    return
  }
  const next = new Map(current)
  next.delete(fromKey)
  next.set(toKey, text)
  appAtomRegistry.set(composerDraftsAtom, next)
}

export const resetComposerDrafts = (): void => {
  if (appAtomRegistry.get(composerDraftsAtom).size === 0) {
    return
  }
  appAtomRegistry.set(composerDraftsAtom, new Map())
}
