import type { ProviderHandoff, TranscriptItem } from "@noyau/contracts/entities/transcript"
import type { Turn, TurnDiff } from "@noyau/contracts/entities/turn"
import type { ProjectId } from "@noyau/contracts/ids"
import { ArrowRightIcon } from "lucide-react"
import { memo } from "react"

import { ThreadMarkdown } from "@/components/thread/ThreadMarkdown"
import { ThreadMessageMeta } from "@/components/thread/ThreadMessageMeta"
import { ThreadPlanCard } from "@/components/thread/ThreadPlanCard"
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
import { useProviders } from "@/hooks/use-control-plane"
import type { ComposerTicket } from "@/lib/composer-tickets"
import {
  providerInstanceIconOf,
  providerInstanceLabelOf,
  providerModelLabelOf,
} from "@/lib/provider-presentation"
import { transcriptLabel } from "@/lib/thread-transcript"
import { transcriptItemCopyText, transcriptItemMessageAt } from "@/lib/transcript-message-at"

function ProviderHandoffMarker({ handoff }: { readonly handoff: ProviderHandoff }) {
  const providers = useProviders()
  const PreviousProviderIcon = providerInstanceIconOf(handoff.previousProvider, providers)
  const ProviderIcon = providerInstanceIconOf(handoff.provider, providers)
  const previousProviderLabel = providerInstanceLabelOf(handoff.previousProvider, providers)
  const providerLabel = providerInstanceLabelOf(handoff.provider, providers)
  const hasModelHandoff =
    handoff.previousModelSelection !== undefined || handoff.modelSelection !== undefined
  const previousLabel = hasModelHandoff
    ? providerModelLabelOf(
        handoff.previousProvider,
        handoff.previousModelSelection ?? null,
        providers,
      )
    : previousProviderLabel
  const label = hasModelHandoff
    ? providerModelLabelOf(handoff.provider, handoff.modelSelection ?? null, providers)
    : providerLabel
  return (
    <div
      aria-label={`Provider handoff: ${previousProviderLabel}, ${previousLabel} to ${providerLabel}, ${label}`}
      className="my-3 flex items-center justify-center gap-2 text-muted-foreground text-xs"
    >
      <PreviousProviderIcon className="size-3.5" />
      <span>{previousLabel}</span>
      <ArrowRightIcon className="size-3.5" aria-hidden="true" />
      <ProviderIcon className="size-3.5" />
      <span>{label}</span>
    </div>
  )
}

function LiveAssistantMessage({
  item,
  streaming,
  flushedPrefix,
  turn,
  workspaceRoot,
  projectId,
  tickets,
  onOpenTicket,
  turnDiff,
  onOpenTurnDiff,
  isLatestTurn,
  onFork,
  forkPending,
  forkDisabled,
}: {
  readonly item: Extract<TranscriptItem, { readonly _tag: "transcript.assistant" }>
  readonly streaming: boolean
  readonly flushedPrefix: string
  readonly turn?:
    | Pick<Turn, "requestedAt" | "completedAt" | "state" | "providerForkPoint">
    | undefined
  readonly workspaceRoot?: string | undefined
  readonly projectId?: ProjectId | undefined
  readonly tickets?: ReadonlyArray<ComposerTicket> | undefined
  readonly onOpenTicket?: ((ticketId: string) => void) | undefined
  readonly turnDiff?: TurnDiff | undefined
  readonly onOpenTurnDiff?: ((filePath?: string) => void) | undefined
  readonly isLatestTurn?: boolean
  readonly onFork?: ((turnId: string) => void) | undefined
  readonly forkPending?: boolean
  readonly forkDisabled?: boolean
}) {
  const paintedText = useAssistantPaint(
    item.text,
    item.threadId,
    item.turnId,
    streaming,
    flushedPrefix,
  )
  if (paintedText.length === 0 && turnDiff === undefined) {
    return null
  }
  return (
    <Message align="start">
      <MessageContent>
        <Bubble variant="ghost" align="start" className="w-full">
          <BubbleContent className="w-full">
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
          {...(onFork === undefined ||
          streaming ||
          turn?.state !== "completed" ||
          turn.providerForkPoint === undefined
            ? {}
            : { onFork: () => onFork(item.turnId), forkPending, forkDisabled })}
        />
      </MessageContent>
    </Message>
  )
}

function ThreadTranscriptItemImpl({
  item,
  streaming,
  flushedPrefix = "",
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
  planActive = false,
  onFork,
  forkPending,
  forkDisabled,
}: {
  readonly item: TranscriptItem
  readonly streaming: boolean
  readonly flushedPrefix?: string
  readonly turn?:
    | Pick<Turn, "requestedAt" | "completedAt" | "state" | "providerForkPoint">
    | undefined
  readonly turnDiff?: TurnDiff | undefined
  readonly onOpenTurnDiff?: ((filePath?: string) => void) | undefined
  readonly isLatestTurn?: boolean
  readonly planActive?: boolean
  readonly onFork?: ((turnId: string) => void) | undefined
  readonly forkPending?: boolean
  readonly forkDisabled?: boolean
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
    const handoff = item.providerHandoff
    return (
      <>
        {handoff === undefined ? null : <ProviderHandoffMarker handoff={handoff} />}
        <Message align="end">
          <MessageContent>
            {item.presentation !== undefined ? (
              <TurnPresentationBubble presentation={item.presentation} />
            ) : attachments !== undefined || item.text !== undefined ? (
              <Bubble variant="default" align="end">
                <BubbleContent className="flex flex-col items-start gap-2 leading-6">
                  {attachments === undefined ? null : (
                    <ThreadTurnImages attachments={attachments} />
                  )}
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
      </>
    )
  }

  if (item._tag === "transcript.assistant") {
    return (
      <LiveAssistantMessage
        item={item}
        streaming={streaming}
        flushedPrefix={flushedPrefix}
        turn={turn}
        workspaceRoot={workspaceRoot}
        projectId={projectId}
        tickets={tickets}
        onOpenTicket={onOpenTicket}
        turnDiff={turnDiff}
        onOpenTurnDiff={onOpenTurnDiff}
        {...(isLatestTurn === undefined ? {} : { isLatestTurn })}
        {...(onFork === undefined ? {} : { onFork, forkPending, forkDisabled })}
      />
    )
  }

  if (item._tag === "transcript.plan") {
    return (
      <Message align="start">
        <MessageContent>
          <ThreadPlanCard
            markdown={item.markdown}
            active={planActive}
            workspaceRoot={workspaceRoot}
            projectId={projectId}
          />
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
