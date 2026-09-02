import type { Thread } from "@noyau/contracts/entities/thread"
import type { TranscriptItem } from "@noyau/contracts/entities/transcript"
import type { LatestTurn, Turn } from "@noyau/contracts/entities/turn"
import type { ProjectId } from "@noyau/contracts/ids"
import { Link } from "@tanstack/react-router"
import { ArrowDownIcon } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { ThreadTranscriptFollowLatest } from "@/components/thread/ThreadTranscriptFollowLatest"
import { ThreadTranscriptItem } from "@/components/thread/ThreadTranscriptItem"
import { ThreadTranscriptToolGroup } from "@/components/thread/ThreadTranscriptTool"
import { ThreadTurnMinimap } from "@/components/thread/ThreadTurnMinimap"
import { ThreadSettledMarker } from "@/components/thread/ThreadTurnProgress"
import type { DraftAnswers } from "@/components/thread/ThreadUserInputQuestionnaire"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { useAssistantPaint, useAssistantPaintTarget } from "@/hooks/use-assistant-paint"
import type { ComposerTicket } from "@/lib/composer-tickets"
import { settledTranscriptLabel } from "@/lib/thread-activity"
import {
  flushedAssistantPrefix,
  groupTranscriptRows,
  lastAssistantIndexByTurnId,
  transcriptGroupRowId,
  transcriptRowId,
  transcriptWithLiveAssistantPlaceholder,
  turnDiffForTranscriptItem,
} from "@/lib/thread-transcript"
import { deriveTurnMinimapItems, TURN_MINIMAP_MIN_ITEMS } from "@/lib/thread-turn-minimap"

const EMPTY_TURNS: ReadonlyArray<Turn> = []
const EMPTY_TRANSCRIPT: ReadonlyArray<TranscriptItem> = []

const transcriptTurnDiffProps = (
  item: TranscriptItem,
  index: number,
  turns: ReadonlyArray<Turn>,
  lastAssistantByTurn: ReadonlyMap<Turn["id"], number>,
  latestTurnId: LatestTurn["turnId"] | undefined,
  onOpenTurnDiff: ((turnId: Turn["id"], filePath?: string) => void) | undefined,
): {
  readonly turnDiff?: ReturnType<typeof turnDiffForTranscriptItem>
  readonly onOpenTurnDiff?: (filePath?: string) => void
  readonly isLatestTurn?: boolean
} => {
  const turnDiff = turnDiffForTranscriptItem(item, index, turns, lastAssistantByTurn)
  const isLatestTurn = latestTurnId !== undefined && item.turnId === latestTurnId
  if (onOpenTurnDiff === undefined) {
    return turnDiff === undefined ? {} : { turnDiff, isLatestTurn }
  }
  const open = (filePath?: string) => onOpenTurnDiff(item.turnId, filePath)
  return turnDiff === undefined
    ? { onOpenTurnDiff: open, isLatestTurn }
    : { turnDiff, onOpenTurnDiff: open, isLatestTurn }
}

function TranscriptAssistantRow({
  item,
  index,
  streaming,
  flushedPrefix,
  keep,
  children,
}: {
  readonly item: Extract<TranscriptItem, { readonly _tag: "transcript.assistant" }>
  readonly index: number
  readonly streaming: boolean
  readonly flushedPrefix: string
  readonly keep: boolean
  readonly children: ReactNode
}) {
  const paintedText = useAssistantPaint(
    item.text,
    item.threadId,
    item.turnId,
    streaming,
    flushedPrefix,
  )
  if (paintedText.length === 0 && !keep) {
    return null
  }
  return (
    <MessageScrollerItem messageId={transcriptRowId(item, index)} live={streaming}>
      {children}
    </MessageScrollerItem>
  )
}

export function ThreadTranscript({
  transcript,
  isRunning,
  latestTurn = null,
  turns = EMPTY_TURNS,
  loading,
  error,
  notices,
  workspaceRoot,
  cwd,
  projectId,
  tickets,
  onOpenTicket,
  draftByRequest,
  legacyFreeformByRequest,
  onDraftAnswersChange,
  onLegacyFreeformChange,
  onRespondApproval,
  onRespondUserInput,
  onOpenTurnDiff,
  scrollerKey,
  followLatestKey = 0,
  composerDockHeight = 0,
  onForkTurn,
  forkPendingTurnId,
  inheritedTranscript = EMPTY_TRANSCRIPT,
  forkOrigin,
  forkSourceTitle,
}: {
  readonly transcript: ReadonlyArray<TranscriptItem>
  readonly isRunning: boolean
  readonly latestTurn?: LatestTurn | null
  readonly turns?: ReadonlyArray<Turn>
  readonly loading: boolean
  readonly error: ReactNode
  readonly notices: ReactNode
  readonly workspaceRoot?: string | undefined
  readonly cwd?: string | undefined
  readonly projectId?: ProjectId | undefined
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined
  readonly draftByRequest: Record<string, DraftAnswers>
  readonly legacyFreeformByRequest: Record<string, string>
  readonly onDraftAnswersChange: (requestId: string, draft: DraftAnswers) => void
  readonly onLegacyFreeformChange: (requestId: string, value: string) => void
  readonly onRespondApproval: (requestId: string, decision: "accept" | "decline") => void
  readonly onRespondUserInput: (requestId: string) => void
  readonly onOpenTurnDiff?: ((turnId: Turn["id"], filePath?: string) => void) | undefined
  readonly scrollerKey?: string
  readonly followLatestKey?: number
  readonly composerDockHeight?: number
  readonly onForkTurn?: ((turnId: string) => void) | undefined
  readonly forkPendingTurnId?: string | undefined
  readonly inheritedTranscript?: ReadonlyArray<TranscriptItem>
  readonly forkOrigin?: Thread["forkOrigin"] | undefined
  readonly forkSourceTitle?: string | undefined
}) {
  const liveTarget = useAssistantPaintTarget()
  const paintedTranscript = useMemo(
    () => transcriptWithLiveAssistantPlaceholder(transcript, liveTarget),
    [liveTarget, transcript],
  )
  const lastItem = paintedTranscript.at(-1)
  const lastAssistant = lastItem?._tag === "transcript.assistant" ? lastItem : undefined
  const latestTurnSettled = latestTurn !== null && latestTurn.state !== "running"
  const streamingLast =
    lastAssistant !== undefined &&
    !latestTurnSettled &&
    (isRunning || (liveTarget !== undefined && liveTarget.turnId === lastAssistant.turnId))
  const settledLabel = isRunning ? null : settledTranscriptLabel(latestTurn)
  const minimapItems = useMemo(() => deriveTurnMinimapItems(paintedTranscript), [paintedTranscript])
  const turnById = useMemo(() => {
    const map = new Map<Turn["id"], Turn>()
    for (const turn of turns) {
      map.set(turn.id, turn)
    }
    return map
  }, [turns])
  const lastAssistantByTurn = useMemo(
    () => lastAssistantIndexByTurnId(paintedTranscript),
    [paintedTranscript],
  )
  const rows = useMemo(() => groupTranscriptRows(paintedTranscript), [paintedTranscript])

  return (
    <MessageScrollerProvider key={scrollerKey} autoScroll>
      <ThreadTranscriptFollowLatest followLatestKey={followLatestKey} />
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport aria-label="Thread transcript">
          <MessageScrollerContent
            aria-busy={isRunning}
            className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6"
            style={{ paddingBottom: composerDockHeight }}
          >
            {loading ? (
              <MessageScrollerItem messageId="thread-loading">
                <p className="text-sm text-muted-foreground">Loading Thread…</p>
              </MessageScrollerItem>
            ) : null}
            {error === undefined ? null : (
              <MessageScrollerItem messageId="thread-error">{error}</MessageScrollerItem>
            )}
            {notices === null || notices === undefined ? null : (
              <MessageScrollerItem messageId="thread-notices">{notices}</MessageScrollerItem>
            )}

            {inheritedTranscript.length === 0 ? null : (
              <>
                <MessageScrollerItem messageId="thread-fork-origin">
                  <div className="my-3 flex items-center gap-3 text-muted-foreground text-xs">
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                    {forkOrigin === undefined || projectId === undefined ? (
                      <span>Conversation inherited from a fork</span>
                    ) : (
                      <Link
                        to="/projects/$projectId/thread/$threadId"
                        params={{ projectId, threadId: forkOrigin.sourceThreadId }}
                        search={{}}
                        className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Forked from <em>{forkSourceTitle ?? "this conversation"}</em>
                      </Link>
                    )}
                    <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  </div>
                </MessageScrollerItem>
                {inheritedTranscript.map((item, index) => (
                  <MessageScrollerItem
                    key={`inherited:${transcriptRowId(item, index)}`}
                    messageId={`inherited:${transcriptRowId(item, index)}`}
                  >
                    <ThreadTranscriptItem
                      item={item}
                      streaming={false}
                      turn={undefined}
                      workspaceRoot={
                        item._tag === "transcript.tool" ? (cwd ?? workspaceRoot) : workspaceRoot
                      }
                      projectId={projectId}
                      draftAnswers={{}}
                      legacyFreeform=""
                      onDraftAnswersChange={onDraftAnswersChange}
                      onLegacyFreeformChange={onLegacyFreeformChange}
                      onRespondApproval={onRespondApproval}
                      onRespondUserInput={onRespondUserInput}
                      {...(tickets === undefined ? {} : { tickets })}
                      {...(onOpenTicket === undefined ? {} : { onOpenTicket })}
                    />
                  </MessageScrollerItem>
                ))}
              </>
            )}

            {rows.map((row) => {
              if (row.kind === "tool-group") {
                return (
                  <MessageScrollerItem
                    key={transcriptGroupRowId(row.items)}
                    messageId={transcriptGroupRowId(row.items)}
                  >
                    <ThreadTranscriptToolGroup
                      items={row.items}
                      workspaceRoot={cwd ?? workspaceRoot}
                    />
                  </MessageScrollerItem>
                )
              }
              const streaming = streamingLast && row.item === lastAssistant
              const flushedPrefix =
                row.item._tag === "transcript.assistant"
                  ? flushedAssistantPrefix(paintedTranscript, row.item.turnId, row.index)
                  : ""
              const turnDiffProps = transcriptTurnDiffProps(
                row.item,
                row.index,
                turns,
                lastAssistantByTurn,
                latestTurn?.turnId,
                onOpenTurnDiff,
              )
              const content = (
                <ThreadTranscriptItem
                  item={row.item}
                  streaming={streaming}
                  planActive={
                    row.item._tag === "transcript.plan" &&
                    isRunning &&
                    row.item.turnId === latestTurn?.turnId
                  }
                  flushedPrefix={flushedPrefix}
                  turn={turnById.get(row.item.turnId)}
                  {...turnDiffProps}
                  workspaceRoot={
                    row.item._tag === "transcript.tool" ? (cwd ?? workspaceRoot) : workspaceRoot
                  }
                  projectId={projectId}
                  draftAnswers={
                    row.item._tag === "transcript.user-input"
                      ? (draftByRequest[row.item.requestId] ?? {})
                      : {}
                  }
                  legacyFreeform={
                    row.item._tag === "transcript.user-input"
                      ? (legacyFreeformByRequest[row.item.requestId] ?? "")
                      : ""
                  }
                  onDraftAnswersChange={onDraftAnswersChange}
                  onLegacyFreeformChange={onLegacyFreeformChange}
                  onRespondApproval={onRespondApproval}
                  onRespondUserInput={onRespondUserInput}
                  {...(onForkTurn === undefined ||
                  row.item._tag !== "transcript.assistant" ||
                  lastAssistantByTurn.get(row.item.turnId) !== row.index
                    ? {}
                    : {
                        onFork: onForkTurn,
                        forkPending: row.item.turnId === forkPendingTurnId,
                        forkDisabled: forkPendingTurnId !== undefined,
                      })}
                  {...(tickets === undefined ? {} : { tickets })}
                  {...(onOpenTicket === undefined ? {} : { onOpenTicket })}
                />
              )
              if (row.item._tag === "transcript.assistant") {
                return (
                  <TranscriptAssistantRow
                    key={transcriptRowId(row.item, row.index)}
                    item={row.item}
                    index={row.index}
                    streaming={streaming}
                    flushedPrefix={flushedPrefix}
                    keep={turnDiffProps.turnDiff !== undefined}
                  >
                    {content}
                  </TranscriptAssistantRow>
                )
              }
              return (
                <MessageScrollerItem
                  key={transcriptRowId(row.item, row.index)}
                  messageId={transcriptRowId(row.item, row.index)}
                  live={streaming}
                >
                  {content}
                </MessageScrollerItem>
              )
            })}

            {isRunning || settledLabel === null ? null : (
              <MessageScrollerItem messageId="thread-settled">
                <ThreadSettledMarker label={settledLabel} />
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {minimapItems.length >= TURN_MINIMAP_MIN_ITEMS ? (
          <ThreadTurnMinimap items={minimapItems} />
        ) : null}
        <MessageScrollerButton style={{ bottom: composerDockHeight + 8 }}>
          <ArrowDownIcon />
          <span className="sr-only">Go to the latest message</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
