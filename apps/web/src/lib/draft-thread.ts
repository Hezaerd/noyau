import type { LatestTurn } from "@noyau/contracts/entities/turn"
import type { ThreadId } from "@noyau/contracts/ids"
import { seedTitleFromTurn } from "@noyau/contracts/thread/title"

import { isComposerDraftEmpty, type ComposerDraftSessionValue } from "@/lib/composer-drafts"

/** Prefer the loaded snapshot so an explicit `null` latestTurn is not lost to `??`. */
export const resolveDraftLatestTurn = (
  pageLatestTurn: LatestTurn | null | undefined,
  shellLatestTurn: LatestTurn | null | undefined,
  pageSnapshotLoaded: boolean,
): LatestTurn | null | undefined => (pageSnapshotLoaded ? pageLatestTurn : shellLatestTurn)

/** Empty persisted Thread, or the `/thread/new` route before the first send. */
export const isDraftThreadView = (input: {
  readonly threadId: ThreadId | undefined
  readonly latestTurn: LatestTurn | null | undefined
  readonly transcriptLength: number
  readonly sending: boolean
}): boolean => {
  if (input.sending) {
    return false
  }
  if (input.threadId === undefined) {
    return true
  }
  if (input.latestTurn === undefined) {
    return false
  }
  return input.latestTurn === null && input.transcriptLength === 0
}

/** Non-empty `/thread/new` Brouillon, listed until the first send creates a Thread. */
export const isListableNewThreadDraft = <TImage>(
  draft: ComposerDraftSessionValue<TImage>,
): boolean => !isComposerDraftEmpty(draft)

/** Sidebar / palette label for an unsaved `/thread/new` Brouillon. */
export const newThreadDraftTitle = (
  draft: ComposerDraftSessionValue<{ readonly upload: { readonly name: string } }>,
): string =>
  seedTitleFromTurn(
    draft.text === "" ? undefined : draft.text,
    draft.images.map((image) => image.upload),
  )
