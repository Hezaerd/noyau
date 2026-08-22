import type { ModelSelection } from "@noyau/protocol/entities/model-selection"
import type { RuntimeMode } from "@noyau/protocol/entities/runtime-mode"
import type { Session, SessionStatus } from "@noyau/protocol/entities/session"
import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type {
  TurnSettlementState,
  TurnState as TurnLifecycleState,
} from "@noyau/protocol/entities/turn"
import type { ProjectId, ThreadId, TurnId } from "@noyau/protocol/ids"
import type { ThreadEvent } from "@noyau/protocol/thread/events"
import { canReplaceThreadTitle } from "@noyau/protocol/thread/title"

export interface TurnProjection {
  readonly turnId: TurnId
  readonly ordinal: number
  readonly state: TurnLifecycleState
}

export interface ThreadProjection {
  readonly threadId: ThreadId
  readonly projectId: ProjectId
  readonly title: string
  readonly provider: "cursor"
  readonly runtimeMode: RuntimeMode
  readonly modelSelection: ModelSelection | null
  readonly branch: string | null
  readonly worktreePath: string | null
  readonly status: "active" | "archived"
  readonly session: Session | null
  readonly turns: ReadonlyArray<TurnProjection>
  readonly transcript: ReadonlyArray<TranscriptItem>
}

export interface ThreadState {
  readonly threads: ReadonlyArray<ThreadProjection>
  /**
   * Disponibilité fournie par la projection Project. Ce contexte n'est pas
   * dérivé des faits Thread et doit être recomposé avant une décision.
   */
  readonly availableProjectIds: ReadonlyArray<ProjectId>
}

export const emptyThreadState: ThreadState = {
  threads: [],
  availableProjectIds: [],
}

/** Compose la disponibilité courante des Projects avant une décision Thread. */
export const withAvailableProjects = (
  state: ThreadState,
  availableProjectIds: ReadonlyArray<ProjectId>,
): ThreadState => ({ ...state, availableProjectIds })

export const latestTurn = (thread: ThreadProjection): TurnProjection | undefined =>
  thread.turns.at(-1)

/**
 * Table de settlement t3code. `starting` et `running` ne terminent jamais un
 * Turn ; tout autre statut porte la fin autoritative de la Session.
 */
export const settledTurnStateForSessionStatus = (
  status: SessionStatus,
): TurnSettlementState | null => {
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

const updateThread = (
  state: ThreadState,
  threadId: ThreadId,
  update: (thread: ThreadProjection) => ThreadProjection,
): ThreadState => ({
  ...state,
  threads: state.threads.map((thread) => (thread.threadId === threadId ? update(thread) : thread)),
})

const updateTurn = (
  thread: ThreadProjection,
  turnId: TurnId,
  update: (turn: TurnProjection) => TurnProjection,
): ThreadProjection => ({
  ...thread,
  turns: thread.turns.map((turn) => (turn.turnId === turnId ? update(turn) : turn)),
})

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

const projectTranscriptItem = (
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

const settleRunningTurn = (thread: ThreadProjection, session: Session): ThreadProjection => {
  const settlement = settledTurnStateForSessionStatus(session.status)
  if (settlement === null) {
    return thread
  }
  const activeTurnId =
    thread.session?.activeTurnId ?? session.activeTurnId ?? latestTurn(thread)?.turnId
  if (activeTurnId === null || activeTurnId === undefined) {
    return thread
  }
  return updateTurn(thread, activeTurnId, (turn) =>
    turn.state === "running" ? { ...turn, state: settlement } : turn,
  )
}

/** Projector pur de l'agrégat Thread, Session, Turns et transcript. */
export const evolve = (state: ThreadState, event: ThreadEvent): ThreadState => {
  switch (event._tag) {
    case "thread.created":
      return {
        ...state,
        threads: [
          ...state.threads,
          {
            threadId: event.threadId,
            projectId: event.projectId,
            title: event.title,
            provider: event.provider,
            runtimeMode: event.runtimeMode,
            modelSelection: event.modelSelection ?? null,
            branch: event.branch ?? null,
            worktreePath: event.worktreePath ?? null,
            status: "active",
            session: null,
            turns: [],
            transcript: [],
          },
        ],
      }
    case "thread.archived":
      return updateThread(state, event.threadId, (thread) => ({ ...thread, status: "archived" }))
    case "thread.restored":
      return updateThread(state, event.threadId, (thread) => ({ ...thread, status: "active" }))
    case "thread.meta-updated":
      return updateThread(state, event.threadId, (thread) => ({
        ...thread,
        title: event.title ?? thread.title,
        branch: event.branch === undefined ? thread.branch : event.branch,
        worktreePath: event.worktreePath === undefined ? thread.worktreePath : event.worktreePath,
      }))
    case "thread.runtime-mode-set":
      return updateThread(state, event.threadId, (thread) => ({
        ...thread,
        runtimeMode: event.runtimeMode,
        session:
          thread.session === null ? null : { ...thread.session, runtimeMode: event.runtimeMode },
      }))
    case "thread.model-selection-set":
      return updateThread(state, event.threadId, (thread) => ({
        ...thread,
        modelSelection: event.modelSelection,
      }))
    case "thread.turn.started":
      return updateThread(state, event.threadId, (thread) => {
        if (thread.turns.some((turn) => turn.turnId === event.turnId)) {
          return thread
        }
        const firstTurn = thread.turns.length === 0
        const titleSeed = event.titleSeed ?? event.text
        let userItem: (typeof thread.transcript)[number] = {
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
        return {
          ...thread,
          title:
            firstTurn && titleSeed !== undefined && canReplaceThreadTitle(thread.title, titleSeed)
              ? titleSeed
              : thread.title,
          runtimeMode: event.runtimeMode ?? thread.runtimeMode,
          modelSelection:
            event.modelSelection === undefined ? thread.modelSelection : event.modelSelection,
          turns: [
            ...thread.turns,
            {
              turnId: event.turnId,
              ordinal: thread.turns.length + 1,
              state: "running",
            },
          ],
          transcript: [...thread.transcript, userItem],
        }
      })
    case "thread.turn.interrupted":
    case "session.stop-requested":
      return state
    case "approval.responded":
      return updateThread(state, event.threadId, (thread) => ({
        ...thread,
        transcript: resolveTranscriptRequest(
          thread.transcript,
          event.requestId,
          "transcript.permission",
        ),
      }))
    case "user-input.responded":
      return updateThread(state, event.threadId, (thread) => ({
        ...thread,
        transcript: resolveTranscriptRequest(
          thread.transcript,
          event.requestId,
          "transcript.user-input",
        ),
      }))
    case "thread.session-set":
      return updateThread(state, event.threadId, (thread) => ({
        ...settleRunningTurn(thread, event.session),
        session: event.session,
      }))
    case "thread.transcript-appended":
      return updateThread(state, event.item.threadId, (thread) => {
        const turn = thread.turns.find((candidate) => candidate.turnId === event.item.turnId)
        return turn?.state !== "running"
          ? thread
          : {
              ...thread,
              transcript: projectTranscriptItem(thread.transcript, event.item),
            }
      })
    case "thread.turn.ended":
      // Le decider persiste ce fait puis émet `thread.session-set`. Seule la
      // sortie de `running` de la Session settle le Turn.
      return state
    case "thread.title-seeded":
      return updateThread(state, event.threadId, (thread) => ({ ...thread, title: event.title }))
  }
}

export const replay = (events: Iterable<ThreadEvent>): ThreadState => {
  let state = emptyThreadState
  for (const event of events) {
    state = evolve(state, event)
  }
  return state
}
