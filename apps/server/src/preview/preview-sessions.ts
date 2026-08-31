import * as NodeCrypto from "@effect/platform-node/NodeCrypto"
import { PreviewTabId, type ThreadId } from "@noyau/contracts/ids"
import {
  PreviewTabNotFound,
  PreviewUrlInvalid,
  type PreviewCloseInput,
  type PreviewCloseResult,
  type PreviewListInput,
  type PreviewListResult,
  type PreviewNavigateInput,
  type PreviewOpenInput,
  type PreviewSessionSnapshot,
} from "@noyau/contracts/preview"
import { normalizePreviewUrl, previewPageTitle } from "@noyau/shared/preview-url"
import { Context, Crypto, DateTime, Effect, Layer, SynchronizedRef } from "effect"

export interface PreviewSessionsService {
  readonly open: (
    input: PreviewOpenInput,
  ) => Effect.Effect<PreviewSessionSnapshot, PreviewUrlInvalid>
  readonly navigate: (
    input: PreviewNavigateInput,
  ) => Effect.Effect<PreviewSessionSnapshot, PreviewUrlInvalid | PreviewTabNotFound>
  readonly list: (input: PreviewListInput) => Effect.Effect<PreviewListResult>
  readonly close: (
    input: PreviewCloseInput,
  ) => Effect.Effect<PreviewCloseResult, PreviewTabNotFound>
}

export class PreviewSessions extends Context.Service<PreviewSessions, PreviewSessionsService>()(
  "@noyau/server/preview/PreviewSessions",
) {}

interface ThreadPreviewState {
  readonly sessions: ReadonlyArray<PreviewSessionSnapshot>
  readonly activeTabId: PreviewTabId | null
}

type PreviewStore = ReadonlyMap<ThreadId, ThreadPreviewState>

const emptyThread = (): ThreadPreviewState => ({
  sessions: [],
  activeTabId: null,
})

const successStatus = (url: string): PreviewSessionSnapshot["navStatus"] => ({
  _tag: "Success",
  url,
  title: previewPageTitle(url),
})

const parseUrl = (threadId: ThreadId, raw: string): Effect.Effect<string, PreviewUrlInvalid> => {
  const normalized = normalizePreviewUrl(raw)
  if (normalized === null) {
    return new PreviewUrlInvalid({ threadId })
  }
  return Effect.succeed(normalized)
}

const readThread = (store: PreviewStore, threadId: ThreadId): ThreadPreviewState =>
  store.get(threadId) ?? emptyThread()

const writeThread = (
  store: PreviewStore,
  threadId: ThreadId,
  next: ThreadPreviewState,
): PreviewStore => {
  const copy = new Map(store)
  if (next.sessions.length === 0) {
    copy.delete(threadId)
  } else {
    copy.set(threadId, next)
  }
  return copy
}

export const makePreviewSessions = Effect.fn("PreviewSessions.make")(function* () {
  const crypto = yield* Crypto.Crypto
  const state = yield* SynchronizedRef.make<PreviewStore>(new Map())

  const open: PreviewSessionsService["open"] = Effect.fn("PreviewSessions.open")(function* (input) {
    const url = input.url === undefined ? undefined : yield* parseUrl(input.threadId, input.url)
    const tabId = PreviewTabId.make(yield* crypto.randomUUIDv4.pipe(Effect.orDie))
    const updatedAt = yield* DateTime.now
    const snapshot: PreviewSessionSnapshot = {
      tabId,
      threadId: input.threadId,
      navStatus: url === undefined ? { _tag: "Idle" } : successStatus(url),
      updatedAt,
    }
    yield* SynchronizedRef.update(state, (store) => {
      const current = readThread(store, input.threadId)
      return writeThread(store, input.threadId, {
        sessions: [...current.sessions, snapshot],
        activeTabId: tabId,
      })
    })
    return snapshot
  })

  const navigate: PreviewSessionsService["navigate"] = Effect.fn("PreviewSessions.navigate")(
    function* (input) {
      const url = yield* parseUrl(input.threadId, input.url)
      const updatedAt = yield* DateTime.now
      const snapshot = yield* SynchronizedRef.modify(state, (store) => {
        const current = readThread(store, input.threadId)
        const index = current.sessions.findIndex((session) => session.tabId === input.tabId)
        const existing = current.sessions[index]
        if (existing === undefined) {
          return [undefined, store] as const
        }
        const nextSnapshot: PreviewSessionSnapshot = {
          ...existing,
          navStatus: successStatus(url),
          updatedAt,
        }
        const sessions = current.sessions.slice()
        sessions[index] = nextSnapshot
        return [
          nextSnapshot,
          writeThread(store, input.threadId, { sessions, activeTabId: input.tabId }),
        ] as const
      })
      if (snapshot === undefined) {
        return yield* new PreviewTabNotFound({ threadId: input.threadId, tabId: input.tabId })
      }
      return snapshot
    },
  )

  const list: PreviewSessionsService["list"] = Effect.fn("PreviewSessions.list")(function* (input) {
    const current = readThread(yield* SynchronizedRef.get(state), input.threadId)
    return {
      threadId: input.threadId,
      activeTabId: current.activeTabId,
      sessions: current.sessions,
    }
  })

  const close: PreviewSessionsService["close"] = Effect.fn("PreviewSessions.close")(
    function* (input) {
      const result = yield* SynchronizedRef.modify(state, (store) => {
        const current = readThread(store, input.threadId)
        const index = current.sessions.findIndex((session) => session.tabId === input.tabId)
        if (index < 0) {
          return [undefined, store] as const
        }
        const sessions = current.sessions.filter((session) => session.tabId !== input.tabId)
        const activeTabId =
          current.activeTabId === input.tabId
            ? (sessions[Math.min(index, sessions.length - 1)]?.tabId ?? null)
            : current.activeTabId
        const next = { sessions, activeTabId }
        return [next, writeThread(store, input.threadId, next)] as const
      })
      if (result === undefined) {
        return yield* new PreviewTabNotFound({ threadId: input.threadId, tabId: input.tabId })
      }
      return { threadId: input.threadId, activeTabId: result.activeTabId }
    },
  )

  return PreviewSessions.of({ open, navigate, list, close })
})

export const previewSessionsLayer = Layer.effect(PreviewSessions, makePreviewSessions()).pipe(
  Layer.provide(NodeCrypto.layer),
)
