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

const userTranscriptFromTurnStarted = (
  event: Extract<EventEnvelope["event"], { readonly _tag: "thread.turn.started" }>,
): TranscriptItem => {
  let userItem: TranscriptItem = {
    _tag: "transcript.user",
    threadId: event.threadId,
    turnId: event.turnId,
  }
  if (event.text !== undefined) {
    userItem = Object.assign(userItem, { text: event.text })
  }
  if (event.attachments !== undefined) {
    userItem = Object.assign(userItem, { attachments: event.attachments })
  }
  if (event.presentation !== undefined) {
    userItem = Object.assign(userItem, { presentation: event.presentation })
  }
  return userItem
}

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
  answers?: Extract<TranscriptItem, { readonly _tag: "transcript.user-input" }>["answers"],
): ReadonlyArray<TranscriptItem> =>
  transcript.map((item) => {
    if (item._tag !== tag || item.requestId !== requestId) {
      return item
    }
    if (tag === "transcript.user-input" && item._tag === "transcript.user-input") {
      return answers === undefined
        ? { ...item, status: "resolved" as const }
        : { ...item, status: "resolved" as const, answers }
    }
    return { ...item, status: "resolved" as const }
  })

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
      return (
        item.title ??
        (item.questions !== undefined && item.questions.length > 1 ? "Questions" : "Question")
      )
    case "transcript.plan":
      return "Plan"
  }
}

const GENERIC_TOOL_NAMES = new Set(["cursor tool", "tool call", "tool"])

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

export const looksLikeToolPath = (value: string): boolean => {
  const trimmed = value.trim()
  if (trimmed.length === 0 || looksLikeJsonDump(trimmed)) {
    return false
  }
  return (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.startsWith(".") ||
    /\.(?:[a-z0-9]{1,12})$/iu.test(trimmed)
  )
}

const isGenericToolName = (name: string): boolean => GENERIC_TOOL_NAMES.has(name.toLowerCase())

export const presentTranscriptTool = (item: TranscriptTool): PresentedTranscriptTool => {
  const dump = item.outputSummary !== undefined && looksLikeJsonDump(item.outputSummary)
  const pathLike = item.outputSummary !== undefined && looksLikeToolPath(item.outputSummary)
  const generic = isGenericToolName(item.name)
  const name = generic && dump ? "Wrote file" : generic && pathLike ? "Read file" : item.name
  const action =
    item.action ??
    actionFromName(name.toLowerCase()) ??
    (dump ? "file_change" : pathLike && generic ? "read" : "other")
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
      return isGenericToolName(presented.name) ? "Used tool" : presented.name
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

export const transcriptToolHeading = (item: TranscriptTool): string =>
  presentTranscriptTool(item).name

export const transcriptToolPreview = (item: TranscriptTool): string | undefined =>
  presentTranscriptTool(item).outputSummary

export const commandProgramName = (command: string): string | undefined => {
  const tokens = command.trim().split(/\s+/u)
  const first = tokens.find((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token))
  const program = first?.split(/[\\/]/u).at(-1)?.trim()
  return program === undefined || program.length === 0 ? undefined : program
}

export const transcriptToolLiveLabel = (item: TranscriptTool): string => {
  const presented = presentTranscriptTool(item)
  if (presented.action === "command") {
    const program =
      presented.outputSummary === undefined
        ? undefined
        : commandProgramName(presented.outputSummary)
    return program === undefined ? "Running command" : `Running ${program}`
  }
  return presented.outputSummary ?? presented.name
}

export const transcriptToolDisplay = (item: TranscriptTool): string => {
  const presented = presentTranscriptTool(item)
  return presented.outputSummary ?? presented.name
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
      return count === 1 ? "Used 1 tool" : `Used ${count} tools`
  }
}

const toolGroupActionCount = (
  action: TranscriptToolAction,
  items: ReadonlyArray<TranscriptTool>,
): number => {
  if (action !== "file_change") {
    return items.length
  }
  const paths = new Set<string>()
  let withoutPath = 0
  for (const item of items) {
    const path = presentTranscriptTool(item).outputSummary
    if (path === undefined) {
      withoutPath += 1
      continue
    }
    paths.add(path)
  }
  return paths.size + withoutPath
}

export const summarizeTranscriptToolGroup = (items: ReadonlyArray<TranscriptTool>): string => {
  const grouped = new Map<TranscriptToolAction, Array<TranscriptTool>>()
  for (const item of items) {
    const action = presentTranscriptTool(item).action
    const group = grouped.get(action)
    if (group === undefined) {
      grouped.set(action, [item])
    } else {
      group.push(item)
    }
  }
  const labels = [...grouped].map(([action, actionItems]) =>
    transcriptToolGroupLabel(action, toolGroupActionCount(action, actionItems)),
  )
  const sentenceLabels = labels.map((label, index) =>
    index === 0 ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  )
  if (sentenceLabels.length < 2) {
    return sentenceLabels[0] ?? "Used 1 tool"
  }
  if (sentenceLabels.length === 2) {
    return sentenceLabels.join(" and ")
  }
  return `${sentenceLabels.slice(0, -1).join(", ")}, and ${sentenceLabels.at(-1)}`
}

export type TranscriptToolGroupKind = TranscriptToolAction | "mixed"

export const transcriptToolGroupKind = (
  items: ReadonlyArray<TranscriptTool>,
): TranscriptToolGroupKind => {
  const actions = new Set(items.map((item) => presentTranscriptTool(item).action))
  if (actions.size !== 1) {
    return "mixed"
  }
  return actions.values().next().value ?? "other"
}

export type TranscriptRow =
  | { readonly kind: "item"; readonly item: TranscriptItem; readonly index: number }
  | {
      readonly kind: "tool-group"
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
    const items: Array<TranscriptTool> = [item]
    const startIndex = index
    index += 1
    while (index < transcript.length) {
      const next = transcript[index]
      if (next === undefined || next._tag !== "transcript.tool" || next.turnId !== item.turnId) {
        break
      }
      items.push(next)
      index += 1
    }
    if (items.length >= 2) {
      rows.push({ kind: "tool-group", items, startIndex })
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
  return `transcript.tool-group:${first.turnId}:${first.toolCallId}`
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
    readonly branch?: Thread["branch"]
    readonly worktreePath?: Thread["worktreePath"]
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
    branch: patch.branch !== undefined ? patch.branch : (current.branch ?? null),
    worktreePath:
      patch.worktreePath !== undefined ? patch.worktreePath : (current.worktreePath ?? null),
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
      const titleSeed = event.titleSeed ?? event.text ?? event.attachments?.[0]?.name
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
            firstTurn &&
            titleSeed !== undefined &&
            canReplaceThreadTitle(snapshot.thread.title, titleSeed)
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
        transcript: [...snapshot.transcript, userTranscriptFromTurnStarted(event)],
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
          event.answers,
        ),
      })
    case "thread.title-seeded":
    case "thread.meta-updated": {
      if (event.threadId !== snapshot.thread.id) {
        return withEnvelope(snapshot, envelope, snapshot)
      }
      return withEnvelope(snapshot, envelope, {
        thread: replaceThread(
          snapshot,
          Object.assign(
            { updatedAt: envelope.occurredAt },
            event.title === undefined ? {} : { title: event.title },
            event._tag === "thread.meta-updated" && event.branch !== undefined
              ? { branch: event.branch }
              : {},
            event._tag === "thread.meta-updated" && event.worktreePath !== undefined
              ? { worktreePath: event.worktreePath }
              : {},
          ),
        ),
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
