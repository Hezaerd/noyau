import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { Option, Schema } from "effect"

export const COMPOSER_DRAFTS_STORAGE_KEY = "noyau:composer-drafts"

const ComposerDraftsRecord = Schema.Record(Schema.String, Schema.String)
const decodeComposerDraftsRecord = Schema.decodeUnknownOption(ComposerDraftsRecord)
const decodeUuid = Schema.decodeUnknownOption(Schema.String.check(Schema.isUUID()))

export type ComposerDrafts = ReadonlyMap<string, string>

export type ComposerDraftSessionValue<TImage> = {
  readonly text: string
  readonly images: ReadonlyArray<TImage>
}

export const emptyComposerDraft = {
  text: "",
  images: [],
} as const

export const isComposerDraftEmpty = <TImage>(draft: ComposerDraftSessionValue<TImage>): boolean =>
  draft.text === "" && draft.images.length === 0

export const sessionDraftsFromStoredTexts = <TImage>(
  stored: ComposerDrafts,
): ReadonlyMap<string, ComposerDraftSessionValue<TImage>> => {
  const drafts = new Map<string, ComposerDraftSessionValue<TImage>>()
  for (const [key, text] of stored) {
    drafts.set(key, { text, images: [] })
  }
  return drafts
}

export const storedTextsFromSessionDrafts = <TImage>(
  drafts: ReadonlyMap<string, ComposerDraftSessionValue<TImage>>,
): ComposerDrafts => {
  const stored = new Map<string, string>()
  for (const [key, draft] of drafts) {
    if (draft.text !== "") {
      stored.set(key, draft.text)
    }
  }
  return stored
}

export const composerDraftStoreKey = (
  projectId: ProjectId,
  threadId: ThreadId | undefined,
): string => (threadId === undefined ? `new:${projectId}` : `thread:${threadId}`)

const isDraftStoreKey = (key: string): boolean => {
  if (key.startsWith("thread:")) {
    return Option.isSome(decodeUuid(key.slice("thread:".length)))
  }
  if (key.startsWith("new:")) {
    return Option.isSome(decodeUuid(key.slice("new:".length)))
  }
  return false
}

export const parseComposerDrafts = (value: string | null): ComposerDrafts => {
  if (value === null || value === "") {
    return new Map()
  }
  let parsed: unknown
  try {
    // SAFETY: JSON.parse is unknown until Schema.decodeUnknownOption checks the record.
    parsed = JSON.parse(value) as unknown
  } catch {
    return new Map()
  }
  return Option.match(decodeComposerDraftsRecord(parsed), {
    onNone: () => new Map(),
    onSome: (record) => {
      const drafts = new Map<string, string>()
      for (const [key, text] of Object.entries(record)) {
        if (!isDraftStoreKey(key) || text === "") {
          continue
        }
        drafts.set(key, text)
      }
      return drafts
    },
  })
}

export const serializeComposerDrafts = (drafts: ComposerDrafts): string => {
  const record: Record<string, string> = {}
  for (const [key, text] of drafts) {
    if (!isDraftStoreKey(key) || text === "") {
      continue
    }
    record[key] = text
  }
  return JSON.stringify(record)
}

export const readStoredComposerDrafts = (): ComposerDrafts => {
  try {
    return parseComposerDrafts(window.localStorage.getItem(COMPOSER_DRAFTS_STORAGE_KEY))
  } catch {
    return new Map()
  }
}

export const persistComposerDrafts = (drafts: ComposerDrafts): void => {
  try {
    if (drafts.size === 0) {
      window.localStorage.removeItem(COMPOSER_DRAFTS_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(COMPOSER_DRAFTS_STORAGE_KEY, serializeComposerDrafts(drafts))
  } catch {
    // Drafts remain active for this renderer session when storage is unavailable.
  }
}
