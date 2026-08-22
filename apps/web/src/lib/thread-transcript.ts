import type { Session, SessionStatus } from "@noyau/protocol/entities/session"
import { Thread } from "@noyau/protocol/entities/thread"
import type { ThreadSnapshot } from "@noyau/protocol/entities/thread-snapshot"
import type {
  TranscriptItem,
  TranscriptTool,
  TranscriptToolAction,
} from "@noyau/protocol/entities/transcript"
import type { LatestTurn, Turn, TurnSettlementState } from "@noyau/protocol/entities/turn"
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

const actionFromName = (name: string): TranscriptToolAction | undefined => {
  switch (name) {
    case "ran command":
      return "command"
    case "read file":
      return "read"
    case "changed files":
    case "wrote file":
      return "file_change"
    case "searched files":
      return "search"
    case "fetched":
      return "fetch"
    case "thinking":
      return "think"
    default:
      return undefined
  }
}

export interface PresentedTranscriptTool {
  readonly action: TranscriptToolAction
  readonly name: string
  readonly outputSummary?: string
}

const looksLikeJsonDump = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return false
  }
  return (
    trimmed.includes('"content"') || trimmed.includes("\\n") || /"[A-Za-z_]\w*":/u.test(trimmed)
  )
}

export const presentTranscriptTool = (item: TranscriptTool): PresentedTranscriptTool => {
  const dump = item.outputSummary !== undefined && looksLikeJsonDump(item.outputSummary)
  const name = item.name.toLowerCase() === "cursor tool" && dump ? "Wrote file" : item.name
  const action =
    item.action ?? actionFromName(name.toLowerCase()) ?? (dump ? "file_change" : "other")
  if (dump || item.outputSummary === undefined) {
    return { action, name }
  }
  return { action, name, outputSummary: item.outputSummary }
}

export const transcriptToolVerb = (item: TranscriptTool): string => {
  const presented = presentTranscriptTool(item)
  switch (presented.action) {
    case "command":
      return "Ran"
    case "read":
      return "Read"
    case "file_change":
      return presented.name.toLowerCase().startsWith("wrote") ? "Wrote" : "Changed"
    case "search":
      return "Searched"
    case "fetch":
      return "Fetched"
    case "think":
      return "Thinking"
    case "other":
      return presented.name
  }
}

export const transcriptToolObject = (item: TranscriptTool): string | undefined =>
  presentTranscriptTool(item).outputSummary

export const transcriptToolCaption = (item: TranscriptTool): string => {
  const presented = presentTranscriptTool(item)
  return presented.outputSummary === undefined
    ? presented.name
    : `${presented.name} · ${presented.outputSummary}`
}

export const transcriptToolGroupLabel = (action: TranscriptToolAction, count: number): string => {
  switch (action) {
    case "command":
      return count === 1 ? "Ran 1 command" : `Ran ${count} commands`
    case "read":
      return count === 1 ? "Read 1 file" : `Read ${count} files`
    case "file_change":
      return count === 1 ? "Changed 1 file" : `Changed ${count} files`
    case "search":
      return count === 1 ? "Searched 1 time" : `Searched ${count} times`
    case "fetch":
      return count === 1 ? "Fetched 1 time" : `Fetched ${count} times`
    case "think":
      return count === 1 ? "1 thought" : `${count} thoughts`
    case "other":
      return count === 1 ? "1 tool call" : `${count} tool calls`
  }
}

export type TranscriptRow =
  | { readonly kind: "item"; readonly item: TranscriptItem; readonly index: number }
  | {
      readonly kind: "tool-group"
      readonly action: TranscriptToolAction
      readonly items: ReadonlyArray<TranscriptTool>
      readonly startIndex: number
    }

export const groupTranscriptRows = (
  transcript: ReadonlyArray<TranscriptItem>,
): ReadonlyArray<TranscriptRow> => {
  const rows: Array<TranscriptRow> = []
  let index = 0
  while (index < transcript.length) {
    const item = transcript[index]
    if (item === undefined || item._tag !== "transcript.tool") {
      if (item !== undefined) {
        rows.push({ kind: "item", item, index })
      }
      index += 1
      continue
    }
    const action = presentTranscriptTool(item).action
    const items: Array<TranscriptTool> = [item]
    const startIndex = index
    index += 1
    while (index < transcript.length) {
      const next = transcript[index]
      if (
        next === undefined ||
        next._tag !== "transcript.tool" ||
        next.turnId !== item.turnId ||
        presentTranscriptTool(next).action !== action
      ) {
        break
      }
      items.push(next)
      index += 1
    }
    if (items.length >= 2) {
      rows.push({ kind: "tool-group", action, items, startIndex })
    } else {
      rows.push({ kind: "item", item, index: startIndex })
    }
  }
  return rows
}

export const transcriptGroupRowId = (items: ReadonlyArray<TranscriptTool>): string => {
  const first = items[0]
  if (first === undefined) {
    return "transcript.tool-group"
  }
  return `transcript.tool-group:${first.turnId}:${presentTranscriptTool(first).action}:${first.toolCallId}`
}

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

/**
 * Table de settlement t3code, recopiée hors `@noyau/domain` : le renderer
 * ne dépend pas du decider. `starting` / `running` ne terminent jamais un Turn.
 */
const settledTurnStateForSessionStatus = (status: SessionStatus): TurnSettlementState | null => {
  switch (status) {
    case "idle":
    case "ready":
      return "completed"
    case "error":
      return "error"
    case "interrupted":
    case "stopped":
      return "interrupted"
    case "starting":
    case "running":
      return null
  }
}

const latestTurnOf = (turns: ReadonlyArray<Turn>): LatestTurn | null => {
  const latest = turns.at(-1)
  return latest === undefined
    ? null
    : {
        turnId: latest.id,
        state: latest.state,
        requestedAt: latest.requestedAt,
        startedAt: latest.startedAt,
        completedAt: latest.completedAt,
      }
}

const replaceThread = (
  snapshot: ThreadSnapshot,
  patch: {
    readonly title?: string
    readonly runtimeMode?: Thread["runtimeMode"]
    readonly modelSelection?: Thread["modelSelection"]
    readonly status?: Thread["status"]
    readonly session?: Session | null
    readonly latestTurn?: LatestTurn | null
    readonly updatedAt?: Thread["updatedAt"]
    readonly archivedAt?: Thread["archivedAt"] | null
  },
): Thread => {
  const current = snapshot.thread
  const archivedAt =
    patch.archivedAt === null ? undefined : (patch.archivedAt ?? current.archivedAt)
  const fields = {
    id: current.id,
    projectId: current.projectId,
    title: patch.title ?? current.title,
    provider: current.provider,
    runtimeMode: patch.runtimeMode ?? current.runtimeMode,
    modelSelection:
      patch.modelSelection === undefined ? current.modelSelection : patch.modelSelection,
    status: patch.status ?? current.status,
    session: patch.session !== undefined ? patch.session : current.session,
    latestTurn: patch.latestTurn !== undefined ? patch.latestTurn : current.latestTurn,
    createdAt: current.createdAt,
    updatedAt: patch.updatedAt ?? current.updatedAt,
  }
  return archivedAt === undefined ? new Thread(fields) : new Thread({ ...fields, archivedAt })
}

const withEnvelope = (
  snapshot: ThreadSnapshot,
  envelope: EventEnvelope,
  patch: Omit<ThreadSnapshot, "snapshotSequence" | "thread"> & {
    readonly thread?: Thread
  },
): ThreadSnapshot => ({
  snapshotSequence: envelope.sequence,
  thread: patch.thread ?? snapshot.thread,
  session: patch.session,
  turns: patch.turns,
  transcript: patch.transcript,
})

const settleRunningTurns = (
  snapshot: ThreadSnapshot,
  session: Session,
  occurredAt: Thread["updatedAt"],
): ReadonlyArray<Turn> => {
  const settlement = settledTurnStateForSessionStatus(session.status)
  if (settlement === null) {
    return snapshot.turns
  }
  const activeTurnId =
    snapshot.session?.activeTurnId ?? session.activeTurnId ?? snapshot.thread.latestTurn?.turnId
  if (activeTurnId === null || activeTurnId === undefined) {
    return snapshot.turns
  }
  return snapshot.turns.map((turn) =>
    turn.id === activeTurnId && turn.state === "running"
      ? { ...turn, state: settlement, completedAt: occurredAt }
      : turn,
  )
}

export const applyThreadEnvelope = (
  snapshot: ThreadSnapshot,
  envelope: EventEnvelope,
): ThreadSnapshot | undefined => {
  const event = envelope.event
  switch (event._tag) {
    case "thread.transcript-appended": {
      const turn = snapshot.turns.find((candidate) => candidate.id === event.item.turnId)
      return withEnvelope(snapshot, envelope, {
        session: snapshot.session,
        turns: snapshot.turns,
        transcript:
          turn?.state === "running"
            ? projectTranscriptItem(snapshot.transcript, event.item)
            : snapshot.transcript,
      })
    }
    case "thread.turn.started": {
      if (event.threadId !== snapshot.thread.id) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      if (snapshot.turns.some((turn) => turn.id === event.turnId)) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      const firstTurn = snapshot.turns.length === 0
      const titleSeed = event.titleSeed ?? event.text
      const turns: ReadonlyArray<Turn> = [
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
      ]
      return withEnvelope(snapshot, envelope, {
        thread: replaceThread(snapshot, {
          title:
            firstTurn && canReplaceThreadTitle(snapshot.thread.title, titleSeed)
              ? titleSeed
              : snapshot.thread.title,
          runtimeMode: event.runtimeMode ?? snapshot.thread.runtimeMode,
          modelSelection:
            event.modelSelection === undefined
              ? snapshot.thread.modelSelection
              : event.modelSelection,
          latestTurn: latestTurnOf(turns),
          updatedAt: envelope.occurredAt,
        }),
        session: snapshot.session,
        turns,
        transcript: [
          ...snapshot.transcript,
          {
            _tag: "transcript.user",
            threadId: event.threadId,
            turnId: event.turnId,
            text: event.text,
          },
        ],
      })
    }
    case "thread.session-set": {
      if (event.threadId !== snapshot.thread.id) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      const turns = settleRunningTurns(snapshot, event.session, envelope.occurredAt)
      return withEnvelope(snapshot, envelope, {
        thread: replaceThread(snapshot, {
          session: event.session,
          latestTurn: latestTurnOf(turns),
          updatedAt: envelope.occurredAt,
        }),
        session: event.session,
        turns,
        transcript: snapshot.transcript,
      })
    }
    case "thread.runtime-mode-set": {
      if (event.threadId !== snapshot.thread.id) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      const session =
        snapshot.session === null ? null : { ...snapshot.session, runtimeMode: event.runtimeMode }
      return withEnvelope(snapshot, envelope, {
        thread: replaceThread(snapshot, {
          runtimeMode: event.runtimeMode,
          session:
            snapshot.thread.session === null
              ? null
              : { ...snapshot.thread.session, runtimeMode: event.runtimeMode },
          updatedAt: envelope.occurredAt,
        }),
        session,
        turns: snapshot.turns,
        transcript: snapshot.transcript,
      })
    }
    case "thread.model-selection-set": {
      if (event.threadId !== snapshot.thread.id) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      return withEnvelope(snapshot, envelope, {
        thread: replaceThread(snapshot, {
          modelSelection: event.modelSelection,
          updatedAt: envelope.occurredAt,
        }),
        session: snapshot.session,
        turns: snapshot.turns,
        transcript: snapshot.transcript,
      })
    }
    case "approval.responded":
      return withEnvelope(snapshot, envelope, {
        session: snapshot.session,
        turns: snapshot.turns,
        transcript: resolveTranscriptRequest(
          snapshot.transcript,
          event.requestId,
          "transcript.permission",
        ),
      })
    case "user-input.responded":
      return withEnvelope(snapshot, envelope, {
        session: snapshot.session,
        turns: snapshot.turns,
        transcript: resolveTranscriptRequest(
          snapshot.transcript,
          event.requestId,
          "transcript.user-input",
        ),
      })
    case "thread.title-seeded":
    case "thread.meta-updated": {
      const title = event.title
      if (title === undefined || event.threadId !== snapshot.thread.id) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      return withEnvelope(snapshot, envelope, {
        thread: replaceThread(snapshot, { title, updatedAt: envelope.occurredAt }),
        session: snapshot.session,
        turns: snapshot.turns,
        transcript: snapshot.transcript,
      })
    }
    case "thread.archived": {
      if (event.threadId !== snapshot.thread.id) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      return withEnvelope(snapshot, envelope, {
        thread: replaceThread(snapshot, {
          status: "archived",
          archivedAt: envelope.occurredAt,
          updatedAt: envelope.occurredAt,
        }),
        session: snapshot.session,
        turns: snapshot.turns,
        transcript: snapshot.transcript,
      })
    }
    case "thread.restored": {
      if (event.threadId !== snapshot.thread.id) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      return withEnvelope(snapshot, envelope, {
        thread: replaceThread(snapshot, {
          status: "active",
          archivedAt: null,
          updatedAt: envelope.occurredAt,
        }),
        session: snapshot.session,
        turns: snapshot.turns,
        transcript: snapshot.transcript,
      })
    }
    case "thread.created":
    case "thread.turn.interrupted":
    case "thread.turn.ended":
    case "session.stop-requested":
      return withEnvelope(snapshot, envelope, snapshot)
    default:
      return undefined
  }
}
