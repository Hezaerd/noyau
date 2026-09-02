import {
  UserInputAnswer,
  type UserInputAnswer as UserInputAnswerType,
} from "@noyau/contracts/entities/approvals"
import type { TranscriptItem, TranscriptUserInput } from "@noyau/contracts/entities/transcript"
import { ApprovalRequestId, ProjectId, ThreadId } from "@noyau/contracts/ids"
import { Option, Schema } from "effect"

export const ASK_QUESTION_DRAFTS_STORAGE_KEY = "noyau:ask-question-drafts"
export const ASK_QUESTION_DRAFTS_VERSION = 1
const MAX_DRAFTS = 50
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000

export type AskQuestionDraftValue = {
  readonly answers: Record<string, UserInputAnswerType>
  readonly legacyFreeform: string
  readonly currentQuestionIndex: number
}

const StoredDraftSchema = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  fingerprint: Schema.String,
  answers: Schema.Record(Schema.String, UserInputAnswer),
  legacyFreeform: Schema.String,
  currentQuestionIndex: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updatedAt: Schema.Finite,
})
const StoredDocumentSchema = Schema.Struct({
  version: Schema.Literal(ASK_QUESTION_DRAFTS_VERSION),
  drafts: Schema.Array(Schema.Unknown),
})
const decodeStoredDocument = Schema.decodeUnknownOption(StoredDocumentSchema)
const decodeStoredDraft = Schema.decodeUnknownOption(StoredDraftSchema)
type StoredDraft = (typeof StoredDraftSchema)["Type"]

export const emptyAskQuestionDraft = (): AskQuestionDraftValue => ({
  answers: {},
  legacyFreeform: "",
  currentQuestionIndex: 0,
})

const keyOf = (projectId: string, threadId: string, requestId: string) =>
  JSON.stringify([projectId, threadId, requestId])

export const parseAskQuestionDrafts = (
  raw: string | null,
  now = Date.now(),
): ReadonlyMap<string, StoredDraft> => {
  if (raw === null || raw === "") return new Map()
  let parsed: unknown
  try {
    // SAFETY: JSON.parse stays unknown until StoredDocumentSchema decodes it below.
    parsed = JSON.parse(raw) as unknown
  } catch {
    return new Map()
  }
  const decoded = decodeStoredDocument(parsed)
  if (Option.isNone(decoded)) return new Map()
  const drafts = new Map<string, StoredDraft>()
  for (const candidate of decoded.value.drafts) {
    const decodedDraft = decodeStoredDraft(candidate)
    if (Option.isNone(decodedDraft)) continue
    const draft = decodedDraft.value
    if (draft.updatedAt < now - MAX_AGE_MS) continue
    const key = keyOf(draft.projectId, draft.threadId, draft.requestId)
    if ((drafts.get(key)?.updatedAt ?? -1) <= draft.updatedAt) drafts.set(key, draft)
  }
  return new Map(
    [...drafts].toSorted(([, a], [, b]) => b.updatedAt - a.updatedAt).slice(0, MAX_DRAFTS),
  )
}

const serialize = (drafts: ReadonlyMap<string, StoredDraft>) =>
  JSON.stringify({ version: ASK_QUESTION_DRAFTS_VERSION, drafts: [...drafts.values()] })

const persistAll = (drafts: ReadonlyMap<string, StoredDraft>) => {
  try {
    if (drafts.size === 0) window.localStorage.removeItem(ASK_QUESTION_DRAFTS_STORAGE_KEY)
    else window.localStorage.setItem(ASK_QUESTION_DRAFTS_STORAGE_KEY, serialize(drafts))
  } catch {
    // The in-memory React draft remains usable when storage is unavailable.
  }
}

const readAll = (now = Date.now()) => {
  try {
    const raw = window.localStorage.getItem(ASK_QUESTION_DRAFTS_STORAGE_KEY)
    const drafts = parseAskQuestionDrafts(raw, now)
    if (raw !== null && raw !== serialize(drafts)) persistAll(drafts)
    return drafts
  } catch {
    return new Map<string, StoredDraft>()
  }
}

export const askQuestionFingerprint = (request: TranscriptUserInput): string =>
  JSON.stringify({
    title: request.title ?? null,
    prompt: request.prompt ?? null,
    questions: (request.questions ?? []).map((question) => ({
      id: question.id,
      prompt: question.prompt,
      allowMultiple: question.allowMultiple === true,
      options: question.options.map((option) => ({ id: option.id, label: option.label })),
    })),
  })

const sanitize = (draft: StoredDraft, request: TranscriptUserInput): AskQuestionDraftValue => {
  const questions = request.questions ?? []
  if (questions.length === 0) {
    return { answers: {}, legacyFreeform: draft.legacyFreeform, currentQuestionIndex: 0 }
  }
  const answers: Record<string, UserInputAnswerType> = {}
  for (const question of questions) {
    const answer = draft.answers[question.id]
    if (answer === undefined) continue
    const valid = new Set(question.options.map((option) => option.id))
    const optionIds = [...new Set(answer.optionIds.filter((id) => valid.has(id)))]
    const selected = question.allowMultiple === true ? optionIds : optionIds.slice(0, 1)
    answers[question.id] =
      answer.freeform === undefined
        ? { optionIds: selected }
        : { optionIds: selected, freeform: answer.freeform }
  }
  return {
    answers,
    legacyFreeform: "",
    currentQuestionIndex: Math.min(draft.currentQuestionIndex, questions.length - 1),
  }
}

export const readAskQuestionDraft = (input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly request: TranscriptUserInput
}): AskQuestionDraftValue => {
  const drafts = new Map(readAll())
  const key = keyOf(input.projectId, input.threadId, input.request.requestId)
  const stored = drafts.get(key)
  if (stored === undefined) return emptyAskQuestionDraft()
  if (stored.fingerprint !== askQuestionFingerprint(input.request)) {
    drafts.delete(key)
    persistAll(drafts)
    return emptyAskQuestionDraft()
  }
  return sanitize(stored, input.request)
}

export const writeAskQuestionDraft = (input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly request: TranscriptUserInput
  readonly value: AskQuestionDraftValue
  readonly now?: number
}): void => {
  const now = input.now ?? Date.now()
  const drafts = new Map(readAll(now))
  drafts.set(keyOf(input.projectId, input.threadId, input.request.requestId), {
    projectId: input.projectId,
    threadId: input.threadId,
    requestId: input.request.requestId,
    fingerprint: askQuestionFingerprint(input.request),
    ...input.value,
    updatedAt: now,
  })
  persistAll(parseAskQuestionDrafts(serialize(drafts), now))
}

export const clearTerminalAskQuestionDrafts = (input: {
  readonly projectId: ProjectId
  readonly threadId: ThreadId
  readonly transcript: ReadonlyArray<TranscriptItem>
}): void => {
  const terminalIds = new Set(
    input.transcript.flatMap((item) =>
      item._tag === "transcript.user-input" &&
      (item.status === "resolved" || item.status === "cancelled" || item.status === "consumed")
        ? [item.requestId]
        : [],
    ),
  )
  if (terminalIds.size === 0) return
  const drafts = new Map(readAll())
  for (const requestId of terminalIds)
    drafts.delete(keyOf(input.projectId, input.threadId, requestId))
  persistAll(drafts)
}
