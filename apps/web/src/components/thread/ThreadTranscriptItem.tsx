import type { TranscriptItem } from "@noyau/protocol/entities/transcript"
import type { ProjectId } from "@noyau/protocol/ids"

import { ThreadMarkdown } from "@/components/thread/ThreadMarkdown"
import { ThreadTranscriptTool } from "@/components/thread/ThreadTranscriptTool"
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
import type { ComposerTicket } from "@/lib/composer-tickets"
import { transcriptLabel } from "@/lib/thread-transcript"

export function ThreadTranscriptItem({
  item,
  streaming,
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
}: {
  readonly item: TranscriptItem
  readonly streaming: boolean
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
    if (item.presentation !== undefined) {
      return (
        <Message align="end">
          <MessageContent>
            <TurnPresentationBubble presentation={item.presentation} />
          </MessageContent>
        </Message>
      )
    }
    return (
      <Message align="end">
        <MessageContent>
          {attachments !== undefined || item.text !== undefined ? (
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
        </MessageContent>
      </Message>
    )
  }

  if (item._tag === "transcript.assistant") {
    return (
      <Message align="start">
        <MessageContent>
          <Bubble variant="ghost" align="start">
            <BubbleContent>
              <ThreadMarkdown
                text={item.text}
                streaming={streaming}
                workspaceRoot={workspaceRoot}
                projectId={projectId}
                {...(tickets === undefined ? {} : { tickets })}
                {...(onOpenTicket === undefined ? {} : { onOpenTicket })}
              />
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
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
                ? "Permission traitée."
                : "Cursor demande une permission."}
            </BubbleContent>
          </Bubble>
          {item.status === "pending" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onRespondApproval(item.requestId, "accept")}>
                Autoriser
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRespondApproval(item.requestId, "decline")}
              >
                Refuser
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
