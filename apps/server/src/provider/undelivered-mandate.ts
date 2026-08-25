import type { TurnImageAttachment } from "@noyau/protocol/entities/attachment"
import type { ResumeCursor } from "@noyau/protocol/entities/session"
import type { TranscriptItem, TranscriptUser } from "@noyau/protocol/entities/transcript"
import type { TurnId } from "@noyau/protocol/ids"
import { isResumePrompt } from "@noyau/shared/resume-prompt"

export interface ProviderTurnPrompt {
  readonly text: string
  readonly attachments: ReadonlyArray<TurnImageAttachment> | undefined
}

export const lastUserMandateBefore = (
  transcript: ReadonlyArray<TranscriptItem>,
  currentTurnId?: TurnId,
): TranscriptUser | undefined => {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const item = transcript[index]
    if (item === undefined || item._tag !== "transcript.user") {
      continue
    }
    if (currentTurnId !== undefined && item.turnId === currentTurnId) {
      continue
    }
    return item
  }
  return undefined
}

const mergeAttachments = (
  prior: ReadonlyArray<TurnImageAttachment> | undefined,
  current: ReadonlyArray<TurnImageAttachment> | undefined,
): ReadonlyArray<TurnImageAttachment> | undefined => {
  if (current !== undefined && current.length > 0) {
    if (prior === undefined || prior.length === 0) {
      return current
    }
    const seen = new Set(current.map((attachment) => attachment.id))
    return [...prior.filter((attachment) => !seen.has(attachment.id)), ...current]
  }
  return prior
}

/** Quand Cursor n'a pas de session, le dernier prompt user de CE Thread voyage avec le Turn. */
export const resolveProviderTurnPrompt = (input: {
  readonly resumeCursor: ResumeCursor | null
  readonly currentText: string
  readonly currentAttachments: ReadonlyArray<TurnImageAttachment> | undefined
  readonly currentTurnId: TurnId
  readonly transcript: ReadonlyArray<TranscriptItem>
}): ProviderTurnPrompt => {
  const current: ProviderTurnPrompt = {
    text: input.currentText,
    attachments: input.currentAttachments,
  }
  if (input.resumeCursor !== null) {
    return current
  }
  const prior = lastUserMandateBefore(input.transcript, input.currentTurnId)
  if (prior === undefined) {
    return current
  }
  const priorText = prior.text ?? ""
  const priorAttachments = prior.attachments
  const currentHasAttachments =
    input.currentAttachments !== undefined && input.currentAttachments.length > 0
  if (isResumePrompt(input.currentText) && !currentHasAttachments) {
    return { text: priorText, attachments: priorAttachments }
  }
  if (input.currentText === priorText) {
    return {
      text: input.currentText,
      attachments: mergeAttachments(priorAttachments, input.currentAttachments),
    }
  }
  if (priorText.length > 0 && input.currentText.trim().length > 0) {
    return {
      text: `${priorText}\n\n${input.currentText}`,
      attachments: mergeAttachments(priorAttachments, input.currentAttachments),
    }
  }
  return {
    text: input.currentText.trim().length > 0 ? input.currentText : priorText,
    attachments: mergeAttachments(priorAttachments, input.currentAttachments),
  }
}
