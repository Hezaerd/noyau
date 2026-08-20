import { Thread } from "@noyau/protocol/entities/thread"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type { EventEnvelope } from "@noyau/protocol/events"
import { canReplaceThreadTitle } from "@noyau/protocol/thread/title"

const replaceTranscriptItem = (
  transcript: ReadonlyArray<TranscriptItem>,
  item: TranscriptItem,
  matches: (candidate: TranscriptItem) => boolean,
): ReadonlyArray<TranscriptItem> => {
  const index = transcript.findIndex(matches)
  return index === -1
    ? [...transcript, item]
    : transcript.map((candidate, candidateIndex) => (candidateIndex === index ? item : candidate))
}

export const projectTranscriptItem = (
  transcript: ReadonlyArray<TranscriptItem>,
  item: TranscriptItem,
): ReadonlyArray<TranscriptItem> => {
  switch (item._tag) {
    case "transcript.user":
      return [...transcript, item]
    case "transcript.assistant": {
      const previous = transcript.at(-1)
      return previous?._tag === "transcript.assistant" && previous.turnId === item.turnId
        ? [...transcript.slice(0, -1), { ...previous, text: `${previous.text}${item.text}` }]
        : [...transcript, item]
    }
    case "transcript.tool":
      return replaceTranscriptItem(
        transcript,
        item,
        (candidate) =>
          candidate._tag === "transcript.tool" &&
          candidate.turnId === item.turnId &&
          candidate.toolCallId === item.toolCallId,
      )
    case "transcript.permission":
      return replaceTranscriptItem(
        transcript,
        item,
        (candidate) =>
          candidate._tag === "transcript.permission" &&
          candidate.turnId === item.turnId &&
          candidate.requestId === item.requestId,
      )
    case "transcript.user-input":
      return replaceTranscriptItem(
        transcript,
        item,
        (candidate) =>
          candidate._tag === "transcript.user-input" &&
          candidate.turnId === item.turnId &&
          candidate.requestId === item.requestId,
      )
    case "transcript.plan":
      return replaceTranscriptItem(
        transcript,
        item,
        (candidate) => candidate._tag === "transcript.plan" && candidate.turnId === item.turnId,
      )
  }
}

const resolveTranscriptRequest = (
  transcript: ReadonlyArray<TranscriptItem>,
  requestId: string,
  tag: "transcript.permission" | "transcript.user-input",
): ReadonlyArray<TranscriptItem> =>
  transcript.map((item) =>
    item._tag === tag && item.requestId === requestId ? { ...item, status: "resolved" } : item,
  )

export const transcriptLabel = (item: TranscriptItem): string => {
  switch (item._tag) {
    case "transcript.user":
      return "You"
    case "transcript.assistant":
      return "Cursor"
    case "transcript.tool":
      return item.name
    case "transcript.permission":
      return "Permission request"
    case "transcript.user-input":
      return "Question from Cursor"
    case "transcript.plan":
      return "Plan"
  }
}

export const transcriptToolCaption = (
  item: Extract<TranscriptItem, { readonly _tag: "transcript.tool" }>,
): string => (item.outputSummary === undefined ? item.name : `${item.name} · ${item.outputSummary}`)

/**
 * Stable row id for MessageScroller. Assistant text grows in place, so the id
 * must not include the streamed body. `index` separates two assistant rows of
 * the same Turn when a tool call lands between them.
 */
export const transcriptRowId = (item: TranscriptItem, index: number): string => {
  switch (item._tag) {
    case "transcript.user":
      return `${item._tag}:${item.turnId}`
    case "transcript.assistant":
      return `${item._tag}:${item.turnId}:${index}`
    case "transcript.tool":
      return `${item._tag}:${item.turnId}:${item.toolCallId}`
    case "transcript.permission":
    case "transcript.user-input":
      return `${item._tag}:${item.turnId}:${item.requestId}`
    case "transcript.plan":
      return `${item._tag}:${item.turnId}`
  }
}

export const threadStatusNoticesVisible = (
  session: { readonly status: string; readonly lastError: string | null } | null | undefined,
  latestTurn: { readonly state: string } | null | undefined,
): boolean =>
  (session?.status === "error" && session.lastError !== null) || latestTurn?.state === "interrupted"

export const applyThreadEnvelope = (
  snapshot: ThreadSnapshot,
  envelope: EventEnvelope,
): ThreadSnapshot | undefined => {
  const event = envelope.event
  switch (event._tag) {
    case "thread.transcript-appended":
      return {
        ...snapshot,
        transcript: projectTranscriptItem(snapshot.transcript, event.item),
      }
    case "thread.turn.started": {
      if (event.threadId !== snapshot.thread.id) {
        return snapshot
      }
      if (snapshot.turns.some((turn) => turn.id === event.turnId)) {
        return snapshot
      }
      const firstTurn = snapshot.turns.length === 0
      const titleSeed = event.titleSeed ?? event.text
      const threadFields = {
        id: snapshot.thread.id,
        projectId: snapshot.thread.projectId,
        title:
          firstTurn && canReplaceThreadTitle(snapshot.thread.title, titleSeed)
            ? titleSeed
            : snapshot.thread.title,
        provider: snapshot.thread.provider,
        runtimeMode: event.runtimeMode ?? snapshot.thread.runtimeMode,
        status: snapshot.thread.status,
        session: snapshot.thread.session,
        latestTurn: {
          turnId: event.turnId,
          state: "running" as const,
          requestedAt: envelope.occurredAt,
          startedAt: envelope.occurredAt,
          completedAt: null,
        },
        createdAt: snapshot.thread.createdAt,
        updatedAt: envelope.occurredAt,
      }
      const thread =
        snapshot.thread.archivedAt === undefined
          ? new Thread(threadFields)
          : new Thread({
              ...threadFields,
              archivedAt: snapshot.thread.archivedAt,
            })
      return {
        ...snapshot,
        thread,
        turns: [
          ...snapshot.turns,
          {
            id: event.turnId,
            threadId: event.threadId,
            ordinal: snapshot.turns.length + 1,
            state: "running",
            requestedAt: envelope.occurredAt,
            startedAt: envelope.occurredAt,
            completedAt: null,
          },
        ],
        transcript: [
          ...snapshot.transcript,
          {
            _tag: "transcript.user",
            threadId: event.threadId,
            turnId: event.turnId,
            text: event.text,
          },
        ],
      }
    }
    case "approval.responded":
      return {
        ...snapshot,
        transcript: resolveTranscriptRequest(
          snapshot.transcript,
          event.requestId,
          "transcript.permission",
        ),
      }
    case "user-input.responded":
      return {
        ...snapshot,
        transcript: resolveTranscriptRequest(
          snapshot.transcript,
          event.requestId,
          "transcript.user-input",
        ),
      }
    case "thread.title-seeded":
    case "thread.meta-updated": {
      const title = event.title
      if (title === undefined || event.threadId !== snapshot.thread.id) {
        return snapshot
      }
      const threadFields = {
        id: snapshot.thread.id,
        projectId: snapshot.thread.projectId,
        title,
        provider: snapshot.thread.provider,
        runtimeMode: snapshot.thread.runtimeMode,
        status: snapshot.thread.status,
        session: snapshot.thread.session,
        latestTurn: snapshot.thread.latestTurn,
        createdAt: snapshot.thread.createdAt,
        updatedAt: envelope.occurredAt,
      }
      return {
        ...snapshot,
        thread:
          snapshot.thread.archivedAt === undefined
            ? new Thread(threadFields)
            : new Thread({ ...threadFields, archivedAt: snapshot.thread.archivedAt }),
      }
    }
    default:
      return undefined
  }
}
