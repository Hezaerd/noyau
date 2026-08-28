import type { ResumeCursor } from "@noyau/contracts/entities/session"
import type { TranscriptItem, TranscriptUser } from "@noyau/contracts/entities/transcript"
import { isResumePrompt } from "@noyau/shared/resume-prompt"

const isResumeOnlyUser = (item: TranscriptUser): boolean => {
  const attachments = item.attachments
  return isResumePrompt(item.text ?? "") && (attachments === undefined || attachments.length === 0)
}

export const lastUserMandate = (
  transcript: ReadonlyArray<TranscriptItem>,
): TranscriptUser | undefined => {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const item = transcript[index]
    if (item === undefined || item._tag !== "transcript.user") {
      continue
    }
    if (isResumeOnlyUser(item)) {
      continue
    }
    return item
  }
  return undefined
}

export const retryableFailedTurnMandate = (input: {
  readonly resumeCursor: ResumeCursor | null | undefined
  readonly sessionStatus: string | undefined
  readonly transcript: ReadonlyArray<TranscriptItem>
}): TranscriptUser | undefined => {
  if (input.resumeCursor != null || input.sessionStatus !== "error") {
    return undefined
  }
  return lastUserMandate(input.transcript)
}
