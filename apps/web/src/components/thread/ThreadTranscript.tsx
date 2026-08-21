import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import { ArrowDownIcon } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { ThreadTranscriptItem } from "@/components/thread/ThreadTranscriptItem"
import { ThreadTranscriptToolGroup } from "@/components/thread/ThreadTranscriptTool"
import { ThreadTurnMinimap } from "@/components/thread/ThreadTurnMinimap"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import { groupTranscriptRows, transcriptGroupRowId, transcriptRowId } from "@/lib/thread-transcript"
import { deriveTurnMinimapItems, TURN_MINIMAP_MIN_ITEMS } from "@/lib/thread-turn-minimap"

export function ThreadTranscript({
  transcript,
  isRunning,
  loading,
  error,
  notices,
  footer,
  answerByRequest,
  onAnswerChange,
  onRespondApproval,
  onRespondUserInput,
}: {
  readonly transcript: ReadonlyArray<TranscriptItem>
  readonly isRunning: boolean
  readonly loading: boolean
  readonly error: ReactNode
  readonly notices: ReactNode
  readonly footer: ReactNode
  readonly answerByRequest: Record<string, string>
  readonly onAnswerChange: (requestId: string, value: string) => void
  readonly onRespondApproval: (requestId: string, decision: "accept" | "decline") => void
  readonly onRespondUserInput: (requestId: string) => void
}) {
  const lastItem = transcript.at(-1)
  const lastAssistant = lastItem?._tag === "transcript.assistant" ? lastItem : undefined
  const showWaitingMarker = isRunning && lastAssistant === undefined
  const minimapItems = useMemo(() => deriveTurnMinimapItems(transcript), [transcript])

  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport aria-label="Transcript du Thread">
          <MessageScrollerContent
            aria-busy={isRunning}
            className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6"
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

            {groupTranscriptRows(transcript).map((row) =>
              row.kind === "tool-group" ? (
                <MessageScrollerItem
                  key={transcriptGroupRowId(row.items)}
                  messageId={transcriptGroupRowId(row.items)}
                >
                  <ThreadTranscriptToolGroup action={row.action} items={row.items} />
                </MessageScrollerItem>
              ) : (
                <MessageScrollerItem
                  key={transcriptRowId(row.item, row.index)}
                  messageId={transcriptRowId(row.item, row.index)}
                  scrollAnchor={row.item._tag === "transcript.user"}
                >
                  <ThreadTranscriptItem
                    item={row.item}
                    streaming={isRunning && row.item === lastAssistant}
                    answer={
                      row.item._tag === "transcript.user-input"
                        ? (answerByRequest[row.item.requestId] ?? "")
                        : ""
                    }
                    onAnswerChange={onAnswerChange}
                    onRespondApproval={onRespondApproval}
                    onRespondUserInput={onRespondUserInput}
                  />
                </MessageScrollerItem>
              ),
            )}

            {showWaitingMarker ? (
              <MessageScrollerItem messageId="thread-thinking">
                <Marker role="status">
                  <MarkerIcon>
                    <Spinner />
                  </MarkerIcon>
                  <MarkerContent>Cursor écrit…</MarkerContent>
                </Marker>
              </MessageScrollerItem>
            ) : null}

            {footer === null || footer === undefined ? null : (
              <MessageScrollerItem messageId="thread-footer" scrollAnchor={false}>
                {footer}
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
