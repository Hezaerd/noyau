import type { TurnImageAttachment } from "@noyau/contracts/entities/attachment"
import type { ResumeCursor } from "@noyau/contracts/entities/session"
import type {
  ProviderHandoff,
  TranscriptItem,
  TranscriptUser,
} from "@noyau/contracts/entities/transcript"
import type { TurnId } from "@noyau/contracts/ids"
import { isResumePrompt } from "@noyau/shared/resume-prompt"

export interface ProviderTurnPrompt {
  readonly text: string
  readonly attachments: ReadonlyArray<TurnImageAttachment> | undefined
}

const HANDOFF_TRANSCRIPT_LIMIT = 48_000

const attachmentNames = (item: TranscriptUser): string =>
  item.attachments === undefined
    ? ""
    : `\nAttachments: ${item.attachments.map((attachment) => attachment.name).join(", ")}`

const handoffBlock = (item: TranscriptItem): string | null => {
  switch (item._tag) {
    case "transcript.user":
      return `User:\n${item.text ?? ""}${attachmentNames(item)}`
    case "transcript.assistant":
      return item.text.trim() === "" ? null : `Assistant:\n${item.text}`
    case "transcript.tool":
      return item.outputSummary === undefined
        ? `Tool (${item.name}): ${item.status}`
        : `Tool (${item.name}, ${item.status}):\n${item.outputSummary}`
    case "transcript.plan":
      return `Plan:\n${item.markdown}`
    case "transcript.user-input": {
      const heading = item.title ?? item.prompt ?? "Provider asked the user for input"
      const answers = item.answers === undefined ? "unanswered" : JSON.stringify(item.answers)
      return `User input (${heading}): ${answers}`
    }
    case "transcript.permission":
      return null
  }
}

const boundedHandoffTranscript = (blocks: ReadonlyArray<string>): string => {
  const kept: Array<string> = []
  let length = 0
  let truncatedBlock = false
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block === undefined) continue
    const nextLength = length + block.length + 2
    if (nextLength > HANDOFF_TRANSCRIPT_LIMIT) {
      if (kept.length === 0) {
        kept.unshift(block.slice(-HANDOFF_TRANSCRIPT_LIMIT))
        truncatedBlock = true
      }
      break
    }
    kept.unshift(block)
    length = nextLength
  }
  const omitted = truncatedBlock || kept.length < blocks.length
  return `${omitted ? "[Earlier transcript items omitted to fit the target context.]\n\n" : ""}${kept.join("\n\n")}`
}

/** Gives a fresh provider the durable Noyau history without reusing another runtime's cursor. */
export const resolveProviderHandoffPrompt = (input: {
  readonly handoff: ProviderHandoff
  readonly currentText: string
  readonly currentAttachments: ReadonlyArray<TurnImageAttachment> | undefined
  readonly currentTurnId: TurnId
  readonly transcript: ReadonlyArray<TranscriptItem>
}): ProviderTurnPrompt => {
  const blocks = input.transcript.flatMap((item) => {
    if (item.turnId === input.currentTurnId) return []
    const block = handoffBlock(item)
    return block === null ? [] : [block]
  })
  const history = boundedHandoffTranscript(blocks)
  const modelTransition =
    input.handoff.previousModelSelection === undefined && input.handoff.modelSelection === undefined
      ? []
      : [
          `Model transition: '${input.handoff.previousModelSelection?.modelId ?? "provider default"}' -> '${input.handoff.modelSelection?.modelId ?? "provider default"}'.`,
        ]
  const text = [
    "[Noyau provider handoff]",
    `This thread moved from provider '${input.handoff.previousProvider}' to '${input.handoff.provider}'.`,
    ...modelTransition,
    "Continue in the existing project checkout. Branch and file changes are already present locally. Inspect the working tree before changing it.",
    "The prior Noyau transcript follows. Treat it as conversation history and preserve the user's intent.",
    "",
    "--- Prior transcript ---",
    history === "" ? "[No prior transcript.]" : history,
    "--- End prior transcript ---",
    "",
    "--- Current user request ---",
    input.currentText,
    "--- End current user request ---",
  ].join("\n")
  return { text, attachments: input.currentAttachments }
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
