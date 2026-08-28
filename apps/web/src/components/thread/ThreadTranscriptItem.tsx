import type { TranscriptItem } from "@noyau/contracts/entities/transcript"
import type { Turn, TurnDiff } from "@noyau/contracts/entities/turn"
import type { ProjectId } from "@noyau/contracts/ids"
import { memo } from "react"

import { ThreadMarkdown } from "@/components/thread/ThreadMarkdown"
import { ThreadMessageMeta } from "@/components/thread/ThreadMessageMeta"
import { ThreadTranscriptTool } from "@/components/thread/ThreadTranscriptTool"
import { ThreadTurnDiffCard } from "@/components/thread/ThreadTurnDiffCard"
import { ThreadTurnImages } from "@/components/thread/ThreadTurnImages"
import {
  StickyUserInputShell,
  ThreadUserInputQuestionnaire,
  type DraftAnswers,
} from "@/components/thread/ThreadUserInputQuestionnaire"
import { TurnPresentationBubble } from "@/components/thread/TurnPresentationBubble"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Message, MessageContent, MessageHeader } from "@/components/ui/message"
import { useAssistantPaint } from "@/hooks/use-assistant-paint"
import type { ComposerTicket } from "@/lib/composer-tickets"
import { transcriptLabel } from "@/lib/thread-transcript"
import { transcriptItemCopyText, transcriptItemMessageAt } from "@/lib/transcript-message-at"

function LiveAssistantMessage({
  item,
  streaming,
  turn,
  workspaceRoot,
  projectId,
  tickets,
  onOpenTicket,
  turnDiff,
  onOpenTurnDiff,
  isLatestTurn,
}: {
  readonly item: Extract<TranscriptItem, { readonly _tag: "transcript.assistant" }>
  readonly streaming: boolean
  readonly turn?: Pick<Turn, "requestedAt" | "completedAt"> | undefined
  readonly workspaceRoot?: string | undefined
  readonly projectId?: ProjectId | undefined
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined
  readonly turnDiff?: TurnDiff | undefined
  readonly onOpenTurnDiff?: ((filePath?: string) => void) | undefined
  readonly isLatestTurn?: boolean
}) {
  const paintedText = useAssistantPaint(item.text, item.threadId, item.turnId, streaming)
  return (
    <Message align="start">
      <MessageContent>
        <Bubble variant="ghost" align="start">
          <BubbleContent>
            <ThreadMarkdown
              text={paintedText}
              streaming={streaming}
              workspaceRoot={workspaceRoot}
              projectId={projectId}
              {...(tickets === undefined ? {} : { tickets })}
              {...(onOpenTicket === undefined ? {} : { onOpenTicket })}
            />
            {turnDiff === undefined ? null : (
              <ThreadTurnDiffCard
                turnDiff={turnDiff}
                {...(isLatestTurn === undefined ? {} : { isLatestTurn })}
                {...(onOpenTurnDiff === undefined ? {} : { onOpen: onOpenTurnDiff })}
              />
            )}
          </BubbleContent>
        </Bubble>
        <ThreadMessageMeta
          align="start"
          at={transcriptItemMessageAt(item, turn, streaming)}
          copyText={transcriptItemCopyText(item, streaming)}
        />
      </MessageContent>
    </Message>
  )
}

function ThreadTranscriptItemImpl({
  item,
  streaming,
  turn,
  workspaceRoot,
  projectId,
  tickets,
  onOpenTicket,
  draftAnswers,
  legacyFreeform,
  onDraftAnswersChange,
  onLegacyFreeformChange,
  onRespondApproval,
  onRespondUserInput,
  turnDiff,
  onOpenTurnDiff,
  isLatestTurn,
}: {
  readonly item: TranscriptItem
  readonly streaming: boolean
  readonly turn?: Pick<Turn, "requestedAt" | "completedAt"> | undefined
  readonly turnDiff?: TurnDiff | undefined
  readonly onOpenTurnDiff?: ((filePath?: string) => void) | undefined
  readonly isLatestTurn?: boolean
  readonly workspaceRoot?: string | undefined
  readonly projectId?: ProjectId | undefined
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined
  readonly draftAnswers: DraftAnswers
  readonly legacyFreeform: string
  readonly onDraftAnswersChange: (requestId: string, draft: DraftAnswers) => void
  readonly onLegacyFreeformChange: (requestId: string, value: string) => void
  readonly onRespondApproval: (requestId: string, decision: "accept" | "decline") => void
  readonly onRespondUserInput: (requestId: string) => void
}) {
  if (item._tag === "transcript.tool") {
    return <ThreadTranscriptTool item={item} workspaceRoot={workspaceRoot} />
  }

  if (item._tag === "transcript.user") {
    const attachments = item.attachments
    return (
      <Message align="end">
        <MessageContent>
          {item.presentation !== undefined ? (
            <TurnPresentationBubble presentation={item.presentation} />
          ) : attachments !== undefined || item.text !== undefined ? (
            <Bubble variant="default" align="end">
              <BubbleContent className="flex flex-col items-start gap-2 leading-6">
                {attachments === undefined ? null : <ThreadTurnImages attachments={attachments} />}
                {item.text === undefined ? null : (
                  <ThreadMarkdown
                    text={item.text}
                    workspaceRoot={workspaceRoot}
                    projectId={projectId}
                    {...(tickets === undefined ? {} : { tickets })}
                    {...(onOpenTicket === undefined ? {} : { onOpenTicket })}
                  />
                )}
              </BubbleContent>
            </Bubble>
          ) : null}
          <ThreadMessageMeta
            align="end"
            at={transcriptItemMessageAt(item, turn)}
            copyText={transcriptItemCopyText(item)}
          />
        </MessageContent>
      </Message>
    )
  }

  if (item._tag === "transcript.assistant") {
    return (
      <LiveAssistantMessage
        item={item}
        streaming={streaming}
        turn={turn}
        workspaceRoot={workspaceRoot}
        projectId={projectId}
        tickets={tickets}
        onOpenTicket={onOpenTicket}
        turnDiff={turnDiff}
        onOpenTurnDiff={onOpenTurnDiff}
        {...(isLatestTurn === undefined ? {} : { isLatestTurn })}
      />
    )
  }

  if (item._tag === "transcript.plan") {
    return (
      <Message align="start">
        <MessageContent>
          <MessageHeader>{transcriptLabel(item)}</MessageHeader>
          <Bubble variant="muted" align="start">
            <BubbleContent>
              <ThreadMarkdown
                text={item.markdown}
                streaming={streaming}
                workspaceRoot={workspaceRoot}
                projectId={projectId}
              />
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }

  if (item._tag === "transcript.permission") {
    return (
      <Message align="start">
        <MessageContent>
          <MessageHeader>{transcriptLabel(item)}</MessageHeader>
          <Bubble variant="muted" align="start">
            <BubbleContent>
              {item.status === "resolved"
                ? "Permission handled."
                : "Cursor is requesting permission."}
            </BubbleContent>
          </Bubble>
          {item.status === "pending" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onRespondApproval(item.requestId, "accept")}>
                Allow
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRespondApproval(item.requestId, "decline")}
              >
                Decline
              </Button>
            </div>
          ) : null}
        </MessageContent>
      </Message>
    )
  }

  return (
    <Message align="start">
      <MessageContent>
        <MessageHeader>{transcriptLabel(item)}</MessageHeader>
        <StickyUserInputShell pending={item.status === "pending"}>
          <ThreadUserInputQuestionnaire
            item={item}
            draft={draftAnswers}
            legacyFreeform={legacyFreeform}
            onDraftChange={onDraftAnswersChange}
            onLegacyFreeformChange={onLegacyFreeformChange}
            onSubmit={onRespondUserInput}
          />
        </StickyUserInputShell>
      </MessageContent>
    </Message>
  )
}

export const ThreadTranscriptItem = memo(ThreadTranscriptItemImpl)
