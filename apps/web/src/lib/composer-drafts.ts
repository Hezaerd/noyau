import type { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { Crypto, Effect, Option, Schema } from "effect"

export const COMPOSER_DRAFTS_STORAGE_KEY = "noyau:composer-drafts"

const ComposerDraftsRecord = Schema.Record(Schema.String, Schema.String)
const decodeComposerDraftsRecord = Schema.decodeUnknownOption(ComposerDraftsRecord)
const decodeUuid = Schema.decodeUnknownOption(Schema.String.check(Schema.isUUID()))
const ThreadRouteSearchSchema = Schema.Struct({
  draft: Schema.optionalKey(Schema.String.check(Schema.isUUID())),
})
const decodeThreadRouteSearch = Schema.decodeUnknownOption(ThreadRouteSearchSchema)

export type ComposerDrafts = ReadonlyMap<string, string>

export type NewThreadDraftId = string

export type NewThreadDraft<TImage> = {
  readonly id: NewThreadDraftId | undefined
  readonly value: ComposerDraftSessionValue<TImage>
}

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
  draftId?: NewThreadDraftId,
): string =>
  threadId === undefined
    ? draftId === undefined
      ? `new:${projectId}`
      : `new:${projectId}:${draftId}`
    : `thread:${threadId}`

export const makeNewThreadDraftId = Effect.fnUntraced(function* () {
  const crypto = yield* Crypto.Crypto
  return yield* crypto.randomUUIDv4
})

export type ThreadRouteSearch = {
  readonly draft?: NewThreadDraftId
}

type ThreadRouteSearchParams = {
  readonly draft?: string | undefined
}

export const parseThreadRouteSearch = (search: ThreadRouteSearchParams): ThreadRouteSearch => {
  return Option.getOrElse(decodeThreadRouteSearch(search), () => ({}))
}

const parseNewThreadDraftKey = (
  key: string,
): { readonly projectId: string; readonly draftId: NewThreadDraftId | undefined } | undefined => {
  if (!key.startsWith("new:")) {
    return undefined
  }
  const [projectId, draftId, ...extra] = key.slice("new:".length).split(":")
  if (
    projectId === undefined ||
    Option.isNone(decodeUuid(projectId)) ||
    extra.length > 0 ||
    (draftId !== undefined && Option.isNone(decodeUuid(draftId)))
  ) {
    return undefined
  }
  return { projectId, draftId }
}

export const projectNewThreadDrafts = <TImage>(
  drafts: ReadonlyMap<string, ComposerDraftSessionValue<TImage>>,
  projectId: ProjectId,
): ReadonlyArray<NewThreadDraft<TImage>> => {
  const projectDrafts: Array<NewThreadDraft<TImage>> = []
  for (const [key, value] of drafts) {
    const parsed = parseNewThreadDraftKey(key)
    if (parsed?.projectId === projectId && !isComposerDraftEmpty(value)) {
      projectDrafts.push({ id: parsed.draftId, value })
    }
  }
  return projectDrafts
}

const isDraftStoreKey = (key: string): boolean => {
  if (key.startsWith("thread:")) {
    return Option.isSome(decodeUuid(key.slice("thread:".length)))
  }
  return parseNewThreadDraftKey(key) !== undefined
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
