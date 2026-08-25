import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type { LatestTurn, Turn } from "@noyau/protocol/entities/turn"
import type { ProjectId } from "@noyau/protocol/ids"
import { ArrowDownIcon } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { ThreadTranscriptFollowLatest } from "@/components/thread/ThreadTranscriptFollowLatest"
import { ThreadTranscriptItem } from "@/components/thread/ThreadTranscriptItem"
import { ThreadTranscriptToolGroup } from "@/components/thread/ThreadTranscriptTool"
import { ThreadTurnMinimap } from "@/components/thread/ThreadTurnMinimap"
import { ThreadSettledMarker, ThreadWorkingMarker } from "@/components/thread/ThreadTurnProgress"
import type { DraftAnswers } from "@/components/thread/ThreadUserInputQuestionnaire"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import type { ComposerTicket } from "@/lib/composer-tickets"
import { settledTranscriptLabel } from "@/lib/thread-activity"
import {
  groupTranscriptRows,
  lastAssistantIndexByTurnId,
  transcriptGroupRowId,
  transcriptRowId,
  turnDiffForTranscriptItem,
} from "@/lib/thread-transcript"
import { deriveTurnMinimapItems, TURN_MINIMAP_MIN_ITEMS } from "@/lib/thread-turn-minimap"

const EMPTY_TURNS: ReadonlyArray<Turn> = []

const transcriptTurnDiffProps = (
  item: TranscriptItem,
  index: number,
  turns: ReadonlyArray<Turn>,
  lastAssistantByTurn: ReadonlyMap<Turn["id"], number>,
  onOpenTurnDiff: ((turnId: Turn["id"], filePath?: string) => void) | undefined,
): {
  readonly turnDiff?: ReturnType<typeof turnDiffForTranscriptItem>
  readonly onOpenTurnDiff?: (filePath?: string) => void
} => {
  const turnDiff = turnDiffForTranscriptItem(item, index, turns, lastAssistantByTurn)
  if (onOpenTurnDiff === undefined) {
    return turnDiff === undefined ? {} : { turnDiff }
  }
  const open = (filePath?: string) => onOpenTurnDiff(item.turnId, filePath)
  return turnDiff === undefined ? { onOpenTurnDiff: open } : { turnDiff, onOpenTurnDiff: open }
}

export function ThreadTranscript({
  transcript,
  isRunning,
  workingStartedAtMs = null,
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
}: {
  readonly transcript: ReadonlyArray<TranscriptItem>
  readonly isRunning: boolean
  readonly workingStartedAtMs?: number | null
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
}) {
  const lastItem = transcript.at(-1)
  const lastAssistant = lastItem?._tag === "transcript.assistant" ? lastItem : undefined
  const settledLabel = isRunning ? null : settledTranscriptLabel(latestTurn)
  const minimapItems = useMemo(() => deriveTurnMinimapItems(transcript), [transcript])
  const turnById = useMemo(() => {
    const map = new Map<Turn["id"], Turn>()
    for (const turn of turns) {
      map.set(turn.id, turn)
    }
    return map
  }, [turns])
  const lastAssistantByTurn = useMemo(() => lastAssistantIndexByTurnId(transcript), [transcript])
  const rows = useMemo(() => groupTranscriptRows(transcript), [transcript])

  return (
    <MessageScrollerProvider key={scrollerKey} autoScroll>
      <ThreadTranscriptFollowLatest followLatestKey={followLatestKey} />
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport aria-label="Transcript du Thread">
          <MessageScrollerContent
            aria-busy={isRunning}
            className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6"
          >
            {loading ? (
              <MessageScrollerItem messageId="thread-loading">
                <p className="text-sm text-muted-foreground">Chargement du Thread…</p>
              </MessageScrollerItem>
            ) : null}
            {error === undefined ? null : (
              <MessageScrollerItem messageId="thread-error">{error}</MessageScrollerItem>
            )}
            {notices === null || notices === undefined ? null : (
              <MessageScrollerItem messageId="thread-notices">{notices}</MessageScrollerItem>
            )}

            {rows.map((row) =>
              row.kind === "tool-group" ? (
                <MessageScrollerItem
                  key={transcriptGroupRowId(row.items)}
                  messageId={transcriptGroupRowId(row.items)}
                >
                  <ThreadTranscriptToolGroup
                    items={row.items}
                    workspaceRoot={cwd ?? workspaceRoot}
                  />
                </MessageScrollerItem>
              ) : (
                <MessageScrollerItem
                  key={transcriptRowId(row.item, row.index)}
                  messageId={transcriptRowId(row.item, row.index)}
                  live={isRunning && row.item === lastAssistant}
                >
                  <ThreadTranscriptItem
                    item={row.item}
                    streaming={isRunning && row.item === lastAssistant}
                    turn={turnById.get(row.item.turnId)}
                    {...transcriptTurnDiffProps(
                      row.item,
                      row.index,
                      turns,
                      lastAssistantByTurn,
                      onOpenTurnDiff,
                    )}
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
                    {...(tickets === undefined ? {} : { tickets })}
                    {...(onOpenTicket === undefined ? {} : { onOpenTicket })}
                  />
                </MessageScrollerItem>
              ),
            )}

            {isRunning ? (
              <MessageScrollerItem messageId="thread-working">
                <ThreadWorkingMarker startedAtMs={workingStartedAtMs} />
              </MessageScrollerItem>
            ) : settledLabel === null ? null : (
              <MessageScrollerItem messageId="thread-settled">
                <ThreadSettledMarker label={settledLabel} />
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {minimapItems.length >= TURN_MINIMAP_MIN_ITEMS ? (
          <ThreadTurnMinimap items={minimapItems} />
        ) : null}
        <MessageScrollerButton>
          <ArrowDownIcon />
          <span className="sr-only">Aller au dernier message</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}
